{-# LANGUAGE DataKinds                  #-}
{-# LANGUAGE DuplicateRecordFields      #-}
{-# LANGUAGE EmptyDataDecls             #-}
{-# LANGUAGE FlexibleContexts           #-}
{-# LANGUAGE GADTs                      #-}
{-# LANGUAGE GeneralizedNewtypeDeriving #-}
{-# LANGUAGE MultiParamTypeClasses      #-}
{-# LANGUAGE OverloadedStrings          #-}
{-# LANGUAGE QuasiQuotes                #-}
{-# LANGUAGE RecordWildCards            #-}
{-# LANGUAGE TemplateHaskell            #-}
{-# LANGUAGE TypeApplications           #-}
{-# LANGUAGE TypeFamilies               #-}

module Utopia.Web.Database where

import           Control.Lens                    hiding ((.>))
import           Control.Monad.Catch
import           Control.Monad.Fail
import           Data.Aeson
import qualified Data.ByteString.Lazy            as BL
import           Data.Pool
import           Data.Profunctor.Product.Default
import           Data.String
import qualified Data.Text                       as T
import           Data.Time
import           Data.UUID                       hiding (null)
import           Data.UUID.V4
import           Database.PostgreSQL.Simple
import           Opaleye
import           Opaleye.Trans
import           Protolude                       hiding (get)
import           System.Environment
import           System.Posix.User
import           Utopia.Web.Database.Types
import           Utopia.Web.Metrics              hiding (count)

data DatabaseMetrics = DatabaseMetrics
                     { _generateUniqueIDMetrics         :: InvocationMetric
                     , _insertProjectMetrics            :: InvocationMetric
                     , _saveProjectMetrics              :: InvocationMetric
                     , _createProjectMetrics            :: InvocationMetric
                     , _deleteProjectMetrics            :: InvocationMetric
                     , _loadProjectMetrics              :: InvocationMetric
                     , _getProjectsForUserMetrics       :: InvocationMetric
                     , _getProjectOwnerMetrics          :: InvocationMetric
                     , _getProjectOwnerDetailsMetrics   :: InvocationMetric
                     , _checkIfProjectOwnerMetrics      :: InvocationMetric
                     , _getShowcaseProjectsMetrics      :: InvocationMetric
                     , _setShowcaseProjectsMetrics      :: InvocationMetric
                     , _updateUserDetailsMetrics        :: InvocationMetric
                     , _getUserDetailsMetrics           :: InvocationMetric
                     , _getUserConfigurationMetrics     :: InvocationMetric
                     , _saveUserConfigurationMetrics    :: InvocationMetric
                     , _checkIfProjectIDReservedMetrics :: InvocationMetric
                     }

createDatabaseMetrics :: Store -> IO DatabaseMetrics
createDatabaseMetrics store = DatabaseMetrics
  <$> createInvocationMetric "utopia.database.generateuniqueid" store
  <*> createInvocationMetric "utopia.database.insertproject" store
  <*> createInvocationMetric "utopia.database.saveproject" store
  <*> createInvocationMetric "utopia.database.createproject" store
  <*> createInvocationMetric "utopia.database.deleteproject" store
  <*> createInvocationMetric "utopia.database.loadproject" store
  <*> createInvocationMetric "utopia.database.getprojectsforuser" store
  <*> createInvocationMetric "utopia.database.getprojectowner" store
  <*> createInvocationMetric "utopia.database.getprojectownerdetails" store
  <*> createInvocationMetric "utopia.database.checkifprojectowner" store
  <*> createInvocationMetric "utopia.database.getshowcaseprojects" store
  <*> createInvocationMetric "utopia.database.setshowcaseprojects" store
  <*> createInvocationMetric "utopia.database.updateuserdetails" store
  <*> createInvocationMetric "utopia.database.getuserdetails" store
  <*> createInvocationMetric "utopia.database.getuserconfiguration" store
  <*> createInvocationMetric "utopia.database.saveuserconfiguration" store
  <*> createInvocationMetric "utopia.database.checkifprojectidreserved" store

data UserIDIncorrectException = UserIDIncorrectException
                              deriving (Eq, Show)

instance Exception UserIDIncorrectException

data MissingFieldsException = MissingFieldsException
                            deriving (Eq, Show)

instance Exception MissingFieldsException

getDatabaseConnectionString :: IO (Maybe String)
getDatabaseConnectionString = lookupEnv "DATABASE_URL"

createDatabasePoolFromConnection :: IO Connection -> IO DBPool
createDatabasePoolFromConnection createConnection = do
  let keepResourceOpenFor = 10
  createPool createConnection close 3 keepResourceOpenFor 3

createLocalDatabasePool :: IO DBPool
createLocalDatabasePool = do
  username <- getEffectiveUserName
  let connectInfo = defaultConnectInfo { connectUser = username, connectDatabase = "utopia" }
  createDatabasePoolFromConnection $ connect connectInfo

createRemoteDatabasePool :: String -> IO DBPool
createRemoteDatabasePool connectionString = createDatabasePoolFromConnection $ connectPostgreSQL $ encodeUtf8 $ toS connectionString

createDatabasePool :: Maybe String -> IO DBPool
createDatabasePool (Just connectionString) = createRemoteDatabasePool connectionString
createDatabasePool Nothing = createLocalDatabasePool

createDatabasePoolFromEnvironment :: IO DBPool
createDatabasePoolFromEnvironment = do
  maybeConnectionString <- getDatabaseConnectionString
  createDatabasePool maybeConnectionString

usePool :: DBPool -> (Connection -> IO a) -> IO a
usePool = withResource

-- Should use the connection to ensure this is unique.
generateUniqueID :: DatabaseMetrics -> IO Text
generateUniqueID metrics = invokeAndMeasure (_generateUniqueIDMetrics metrics) $
  T.take 8 . toText <$> nextRandom

encodeContent :: Value -> ByteString
encodeContent content = BL.toStrict $ encode content

getProjectContent :: ByteString -> IO Value
getProjectContent content = either fail pure $ eitherDecodeStrict' content

notDeletedProject :: FieldNullable SqlBool -> Field SqlBool
notDeletedProject deletedFlag = isNull deletedFlag .|| deletedFlag .=== toFields (Just False)

printSql :: Default Unpackspec fields fields => Select fields -> IO ()
printSql = putStrLn . fromMaybe "Empty select" . showSql

loadProject :: DatabaseMetrics -> DBPool -> Text -> IO (Maybe DecodedProject)
loadProject metrics pool projectID = invokeAndMeasure (_loadProjectMetrics metrics) $ usePool pool $ \connection -> do
  let projectLookupQuery = do
            project@(projId, _, _, _, _, _, deleted) <- projectSelect
            where_ $ projId .== toFields projectID
            where_ $ notDeletedProject deleted
            pure project
  projects <- runSelect connection projectLookupQuery
  traverse projectToDecodedProject $ listToMaybe projects

projectToDecodedProject :: Project -> IO DecodedProject
projectToDecodedProject (projectId, ownerId, title, _, modifiedAt, content, _) = do
  projectCont <- getProjectContent content
  pure $ DecodedProject { id=projectId
                        , ownerId=ownerId
                        , title=title
                        , modifiedAt=modifiedAt
                        , content=projectCont
                        }

createProject :: DatabaseMetrics -> DBPool -> IO Text
createProject metrics pool = invokeAndMeasure (_createProjectMetrics metrics) $ usePool pool $ \connection -> do
  projectID <- generateUniqueID metrics
  void $ runInsert_ connection $ Insert
                                 { iTable = projectIDTable
                                 , iRows = [toFields projectID]
                                 , iReturning = rCount
                                 , iOnConflict = Nothing
                                 }
  return projectID

insertProject :: DatabaseMetrics -> Connection -> Text -> Text -> UTCTime -> Maybe Text -> Maybe Value -> IO ()
insertProject metrics connection userId projectId timestamp (Just pTitle) (Just projectContents) = invokeAndMeasure (_insertProjectMetrics metrics) $ do
  let projectInsert = Insert
                      { iTable = projectTable
                      , iRows = [toFields (projectId, userId, pTitle, timestamp, timestamp, encodeContent projectContents, Nothing :: Maybe Bool)]
                      , iReturning = rCount
                      , iOnConflict = Nothing
                      }
  void $ runInsert_ connection projectInsert
insertProject _ _ _ _ _ _ _ = throwM MissingFieldsException

saveProject :: DatabaseMetrics -> DBPool -> Text -> Text -> UTCTime -> Maybe Text -> Maybe Value -> IO ()
saveProject metrics pool userId projectId timestamp possibleTitle possibleProjectContents = invokeAndMeasure (_saveProjectMetrics metrics) $ usePool pool $ \connection -> do
  projectOwner <- getProjectOwnerWithConnection metrics connection projectId
  saveProjectInner metrics connection userId projectId timestamp possibleTitle possibleProjectContents projectOwner

saveProjectInner :: DatabaseMetrics -> Connection -> Text -> Text -> UTCTime -> Maybe Text -> Maybe Value -> Maybe Text -> IO ()
saveProjectInner _ connection userId projectId timestamp possibleTitle possibleProjectContents (Just existingOwner) = do
  let correctUser = existingOwner == userId
  let projectContentUpdate = maybe identity (set _6 . toFields . encodeContent) possibleProjectContents
  let projectTitleUpdate = maybe identity (set _3 . toFields) possibleTitle
  let modifiedAtUpdate = set _5 $ toFields timestamp
  let projectUpdate = Update
                    { uTable = projectTable
                    , uUpdateWith = updateEasy (projectContentUpdate . projectTitleUpdate . modifiedAtUpdate)
                    , uWhere = \(projId, _, _, _, _, _, _) -> projId .== toFields projectId
                    , uReturning = rCount
                    }
  when correctUser $ void $ runUpdate_ connection projectUpdate
  unless correctUser $ throwM UserIDIncorrectException
saveProjectInner metrics connection userId projectId timestamp possibleTitle possibleProjectContents Nothing =
  insertProject metrics connection userId projectId timestamp possibleTitle possibleProjectContents

deleteProject :: DatabaseMetrics -> DBPool -> Text -> Text -> IO ()
deleteProject metrics pool userId projectId = invokeAndMeasure (_deleteProjectMetrics metrics) $ usePool pool $ \connection -> do
  correctUser <- checkIfProjectOwnerWithConnection metrics connection userId projectId
  print ("correctUser" :: Text, correctUser)
  let projectUpdate = Update
                    { uTable = projectTable
                    , uUpdateWith = updateEasy (set _7 $ toFields $ Just True)
                    , uWhere = \(projId, _, _, _, _, _, _) -> projId .=== toFields projectId
                    , uReturning = rCount
                    }
  when correctUser $ void $ runUpdate_ connection projectUpdate
  fromDB <- runSelect connection $ do
    (rowProjectId, _, _, _, _, _, rowDeleted) <- projectSelect
    where_ $ rowProjectId .=== toFields projectId
    pure (rowProjectId, rowDeleted)
  print ("fromDB" :: Text, fromDB :: [(Text, Maybe Bool)])
  unless correctUser $ throwM UserIDIncorrectException

projectMetadataFields :: Text
projectMetadataFields = "project.proj_id, project.owner_id, user_details.name, user_details.picture, project.title, project.created_at, project.modified_at, project.deleted"

projectMetadataSelect :: Text -> Text
projectMetadataSelect fieldToCheck =
  "select " <> projectMetadataFields <> " from project inner join user_details on project.owner_id = user_details.user_id where " <> fieldToCheck <> " = ? and (deleted IS NULL or deleted = FALSE)"

projectMetadataSelectByProjectId :: Text
projectMetadataSelectByProjectId = projectMetadataSelect "proj_id"

projectMetadataSelectByOwnerId :: Text
projectMetadataSelectByOwnerId = projectMetadataSelect "owner_id"

projectMetataFromColumns :: (Text, Text, Maybe Text, Maybe Text, Text, UTCTime, UTCTime, Maybe Bool) -> ProjectMetadata
projectMetataFromColumns (id, ownerId, ownerName, ownerPicture, title, createdAt, modifiedAt, Nothing) =
  let deleted = False
      description = Nothing
   in ProjectMetadata{..}
projectMetataFromColumns (id, ownerId, ownerName, ownerPicture, title, createdAt, modifiedAt, Just deleted) =
  let description = Nothing
   in ProjectMetadata{..}

lookupProjectMetadata :: Maybe (ProjectFields -> Column PGBool) -> Maybe (UserDetailsFields -> Column PGBool) -> Connection -> IO [ProjectMetadata]
lookupProjectMetadata projectFilter userDetailsFilter connection = do
  metadataEntries <- runSelect connection $ do
    project@(projectId, ownerId, title, createdAt, modifiedAt, _, deleted) <- projectSelect
    userDetails@(userId, _, name, picture) <- userDetailsSelect
    -- Join the tables.
    where_ $ ownerId .== userId
    -- If there is one, apply the project filter.
    traverse_ (\rowFilter -> where_ $ rowFilter project) projectFilter
    -- If there is one, apply the user filter.
    traverse_ (\rowFilter -> where_ $ rowFilter userDetails) userDetailsFilter
    pure (projectId, ownerId, name, picture, title, createdAt, modifiedAt, deleted)
  pure $ fmap projectMetataFromColumns metadataEntries

getProjectMetadataWithConnection :: DatabaseMetrics -> DBPool -> Text -> IO (Maybe ProjectMetadata)
getProjectMetadataWithConnection metrics pool projectId = invokeAndMeasure (_getProjectsForUserMetrics metrics) $ usePool pool $ \connection -> do
  result <- lookupProjectMetadata (Just (\(rowProjectId, _, _, _, _, _, _) -> rowProjectId .== toFields projectId)) Nothing connection
  pure $ listToMaybe result

getProjectsForUser :: DatabaseMetrics -> DBPool -> Text -> IO [ProjectMetadata]
getProjectsForUser metrics pool userId = invokeAndMeasure (_getProjectsForUserMetrics metrics) $ usePool pool $ \connection -> do
  lookupProjectMetadata (Just (\(_, _, _, _, _, _, rowDeleted) -> notDeletedProject rowDeleted)) (Just (\(rowUserId, _, _, _) -> rowUserId .== toFields userId)) connection

getProjectOwnerWithConnection :: DatabaseMetrics -> Connection -> Text -> IO (Maybe Text)
getProjectOwnerWithConnection metrics connection projectId = invokeAndMeasure (_getProjectOwnerMetrics metrics) $ do
  result <- runSelect connection $ do
    (rowProjectId, rowOwnerId, _, _, _, _, _) <- projectSelect
    where_ $ rowProjectId .== toFields projectId
    pure rowOwnerId
  pure $ listToMaybe result

getProjectOwner :: DatabaseMetrics -> DBPool -> Text -> IO (Maybe Text)
getProjectOwner metrics pool projectId = usePool pool $ \connection -> do
  getProjectOwnerWithConnection metrics connection projectId

checkIfProjectOwner :: DatabaseMetrics -> DBPool -> Text -> Text -> IO Bool
checkIfProjectOwner metrics pool userId projectId = usePool pool $ \connection -> do
  checkIfProjectOwnerWithConnection metrics connection userId projectId

checkIfProjectOwnerWithConnection :: DatabaseMetrics -> Connection -> Text -> Text -> IO Bool
checkIfProjectOwnerWithConnection metrics connection userId projectId = invokeAndMeasure (_checkIfProjectOwnerMetrics metrics) $ do
  maybeProjectOwner <- getProjectOwnerWithConnection metrics connection projectId
  return (maybeProjectOwner == Just userId)

getShowcaseProjects :: DatabaseMetrics -> DBPool -> IO [ProjectMetadata]
getShowcaseProjects metrics pool = invokeAndMeasure (_getShowcaseProjectsMetrics metrics) $ usePool pool $ \connection -> do
  showcaseElements <- runSelect connection showcaseSelect
  let projectIds = fmap fst showcaseElements :: [Text]
  projects <- foldMap (\projectIdToLookup -> lookupProjectMetadata (Just (\(rowProjectId, _, _, _, _, _, _) -> rowProjectId .== toFields projectIdToLookup)) Nothing connection) projectIds
  let findIndex ProjectMetadata{..} = snd <$> find (\(projId, _) -> projId == id) showcaseElements :: Maybe Int
  let sortedProjects = sortOn findIndex projects
  pure sortedProjects

setShowcaseProjects :: DatabaseMetrics -> DBPool -> [Text] -> IO ()
setShowcaseProjects metrics pool projectIds = invokeAndMeasure (_setShowcaseProjectsMetrics metrics) $ usePool pool $ \connection -> do
  let records = zip projectIds ([1..] :: [Int])
  void $ runDelete_ connection $ Delete
                               { dTable = showcaseTable
                               , dWhere = const $ toFields True
                               , dReturning = rCount
                               }
  void $ runInsert_ connection $ Insert
                               { iTable = showcaseTable
                               , iRows = fmap toFields records
                               , iReturning = rCount
                               , iOnConflict = Nothing
                               }

getSingleValue :: a -> IO [a] -> IO a
getSingleValue defaultValue = fmap (fromMaybe defaultValue . listToMaybe)

getCount :: IO [Int] -> IO Int
getCount = getSingleValue 0

getBool :: IO [Bool] -> IO Bool
getBool = getSingleValue False

updateUserDetails :: DatabaseMetrics -> DBPool -> UserDetails -> IO ()
updateUserDetails metrics pool UserDetails{..} = invokeAndMeasure (_updateUserDetailsMetrics metrics) $ usePool pool $ \connection -> do
  let userDetailsEntry = toFields (userId, email, name, picture)
  let insertNew = void $ runInsert_ connection $ Insert
                                               { iTable = userDetailsTable
                                               , iRows = [userDetailsEntry]
                                               , iReturning = rCount
                                               , iOnConflict = Nothing
                                               }
  let updateOld = void $ runUpdate_ connection $ Update
                                               { uTable = userDetailsTable
                                               , uUpdateWith = updateEasy (\_ -> toFields (userId, email, name, picture))
                                               , uWhere = (\(rowUserId, _, _, _) -> rowUserId .=== toFields userId)
                                               , uReturning = rCount
                                               }
  alreadyExists <- getBool $ runSelect connection $ do
    rowCount <- aggregate count $ do
      (rowUserId, _, _, _) <- userDetailsSelect
      where_ $ rowUserId .=== toFields userId
      pure rowUserId
    pure (rowCount .> toFields (0 :: Int64))
  if alreadyExists then updateOld else insertNew

userDetailsFromRow :: (Text, Maybe Text, Maybe Text, Maybe Text) -> UserDetails
userDetailsFromRow (userId, email, name, picture) = UserDetails{..}

getUserDetails :: DatabaseMetrics -> DBPool -> Text -> IO (Maybe UserDetails)
getUserDetails metrics pool userId = invokeAndMeasure (_getUserDetailsMetrics metrics) $ usePool pool $ \connection -> do
  userDetails <- runSelect connection $ do
    userRow@(rowUserId, _, _, _) <- userDetailsSelect
    where_ $ rowUserId .== toFields userId
    pure userRow
  pure $ fmap userDetailsFromRow $ listToMaybe userDetails

userConfigurationToDecodedUserConfiguration :: UserConfiguration -> IO DecodedUserConfiguration
userConfigurationToDecodedUserConfiguration (userId, encodedShortcutConfig) = do
  let decodeShortcutConfig conf = either fail return $ eitherDecodeStrict' $ encodeUtf8 conf
  decodedShortcutConfig <- traverse decodeShortcutConfig encodedShortcutConfig
  return $ DecodedUserConfiguration
              { id = userId
              , shortcutConfig = decodedShortcutConfig
              }

getUserConfiguration :: DatabaseMetrics -> DBPool -> Text -> IO (Maybe DecodedUserConfiguration)
getUserConfiguration metrics pool userId = invokeAndMeasure (_getUserConfigurationMetrics metrics) $ usePool pool $ \connection -> do
  userConf <- fmap listToMaybe $ runSelect connection $ do
    configurationRow@(rowUserId, _) <- userConfigurationSelect
    where_ $ rowUserId .== toFields userId
    pure configurationRow
  traverse userConfigurationToDecodedUserConfiguration userConf

saveUserConfiguration :: DatabaseMetrics -> DBPool -> Text -> Maybe Value -> IO ()
saveUserConfiguration metrics pool userId updatedShortcutConfig = invokeAndMeasure (_saveUserConfigurationMetrics metrics) $ usePool pool $ \connection -> do
  encodedShortcutConfig <- do
    let encoded = fmap encode updatedShortcutConfig
    either (fail . show) pure $ traverse decodeUtf8' $ fmap BL.toStrict encoded
  let newRecord = (toFields userId, toFields encodedShortcutConfig)
  let insertConfig = void $ insert userConfigurationTable newRecord
  let updateConfig = const $ void $ update userConfigurationTable (\(rowUserId, _) -> (rowUserId, toFields encodedShortcutConfig)) (\(rowUserId, _) -> rowUserId .== toFields userId)
  runOpaleyeT connection $ transaction $ do
    userConf <- queryFirst $ do
      (rowUserId, _) <- userConfigurationSelect
      where_ $ rowUserId .== toFields userId
      pure rowUserId
    maybe insertConfig updateConfig (userConf :: Maybe Text)

checkIfProjectIDReserved :: DatabaseMetrics -> DBPool -> Text -> IO Bool
checkIfProjectIDReserved metrics pool projectId = invokeAndMeasure (_checkIfProjectIDReservedMetrics metrics) $ usePool pool $ \connection -> do
  entries <- runSelect connection $ do
    rowProjectId <- projectIDSelect
    where_ $ rowProjectId .== toFields projectId
  pure $ Protolude.not $ Protolude.null entries
