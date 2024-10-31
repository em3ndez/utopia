import { getProjectFileByFilePath } from '../../../../components/assets'
import type { ProjectContentTreeRoot } from 'utopia-shared/src/types'
import { isTextFile } from '../../project-file-types'
import type { EditorDispatch } from '../../../../components/editor/action-types'
import CheckPackageJson from './requirements/requirement-package-json'
import CheckLanguage from './requirements/requirement-language'
import CheckReactVersion from './requirements/requirement-react'
import { RequirementResolutionResult } from './utopia-requirements-types'
import type { ProjectRequirement, RequirementCheck } from './utopia-requirements-types'
import { notifyCheckingRequirement, notifyResolveRequirement } from './utopia-requirements-service'
import CheckStoryboard from './requirements/requirement-storyboard'

export function checkAndFixUtopiaRequirements(
  dispatch: EditorDispatch,
  parsedProjectContents: ProjectContentTreeRoot,
): { result: RequirementResolutionResult; fixedProjectContents: ProjectContentTreeRoot } {
  const checks: Record<ProjectRequirement, RequirementCheck> = {
    storyboard: new CheckStoryboard(),
    packageJsonEntries: new CheckPackageJson(),
    language: new CheckLanguage(),
    reactVersion: new CheckReactVersion(),
  }
  let projectContents = parsedProjectContents
  let result: RequirementResolutionResult = RequirementResolutionResult.Found
  // iterate over all checks, updating the project contents as we go
  for (const [name, check] of Object.entries(checks)) {
    const checkName = name as ProjectRequirement
    notifyCheckingRequirement(dispatch, checkName, check.getStartText())
    const checkResult = check.check(projectContents)
    if (checkResult.resolution === RequirementResolutionResult.Critical) {
      result = RequirementResolutionResult.Critical
    }
    notifyResolveRequirement(
      dispatch,
      checkName,
      checkResult.resolution,
      checkResult.resultText,
      checkResult.resultValue,
    )
    projectContents = checkResult.newProjectContents ?? projectContents
  }
  return { result: result, fixedProjectContents: projectContents }
}

export function getPackageJson(
  projectContents: ProjectContentTreeRoot,
): { utopia?: Record<string, string>; dependencies?: Record<string, string> } | null {
  return getJsonFile<{ utopia?: Record<string, string>; dependencies?: Record<string, string> }>(
    projectContents,
    '/package.json',
  )
}

export function getPackageLockJson(
  projectContents: ProjectContentTreeRoot,
): { dependencies?: Record<string, string> } | null {
  return getJsonFile<{ dependencies?: Record<string, string> }>(
    projectContents,
    '/package-lock.json',
  )
}

function getJsonFile<T>(projectContents: ProjectContentTreeRoot, fileName: string): T | null {
  const file = getProjectFileByFilePath(projectContents, fileName)
  if (file != null && isTextFile(file)) {
    return JSON.parse(file.fileContents.code) as T
  }
  return null
}
