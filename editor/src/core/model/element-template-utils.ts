import {
  getContentsTreeFileFromString,
  ProjectContentTreeRoot,
  walkContentsTree,
  walkContentsTreeForParseSuccess,
} from '../../components/assets'
import { ComponentRendererComponent } from '../../components/canvas/ui-jsx-canvas-renderer/ui-jsx-canvas-component-renderer'
import { importedFromWhere } from '../../components/editor/import-utils'
import Utils, { IndexPosition } from '../../utils/utils'
import { Either, isRight } from '../shared/either'
import {
  ElementInstanceMetadata,
  ElementsWithin,
  getJSXElementNameLastPart,
  isJSXArbitraryBlock,
  isJSXAttributeValue,
  isJSXElement,
  isJSXTextBlock,
  isUtopiaJSXComponent,
  JSXArbitraryBlock,
  JSXElement,
  JSXElementChild,
  JSXTextBlock,
  TopLevelElement,
  UtopiaJSXComponent,
  isJSXFragment,
  getJSXAttribute,
  getJSXElementNameAsString,
} from '../shared/element-template'
import {
  Imports,
  isParseSuccess,
  isTextFile,
  StaticElementPath,
  StaticTemplatePath,
  TemplatePath,
} from '../shared/project-file-types'
import * as TP from '../shared/template-path'
import {
  fixUtopiaElement,
  generateUID,
  getUtopiaIDFromJSXElement,
  setUtopiaIDOnJSXElement,
} from '../shared/uid-utils'
import { fastForEach } from '../shared/utils'
import {
  isUtopiaAPIComponent,
  getComponentsFromTopLevelElements,
  isGivenUtopiaAPIElement,
  isSceneAgainstImports,
} from './project-file-utils'
import { getStoryboardTemplatePath } from './scene-utils'

function getAllUniqueUidsInner(
  projectContents: ProjectContentTreeRoot,
  throwErrorWithSuspiciousActions?: string,
): Array<string> {
  let uniqueIDs: Set<string> = Utils.emptySet()

  function extractUid(element: JSXElementChild): void {
    if (isJSXElement(element)) {
      fastForEach(element.children, extractUid)
      const uidProp = getJSXAttribute(element.props, 'data-uid')
      if (uidProp != null && isJSXAttributeValue(uidProp)) {
        const uid = uidProp.value
        if (throwErrorWithSuspiciousActions) {
          if (uniqueIDs.has(uid)) {
            throw new Error(
              `Found duplicate UID: '${uid}'. Suspicious action(s): ${throwErrorWithSuspiciousActions}`,
            )
          }
        }
        uniqueIDs.add(uid)
      } else {
        if (throwErrorWithSuspiciousActions) {
          throw new Error(
            `Found JSXElement with missing UID. Suspicious action(s): ${throwErrorWithSuspiciousActions}`,
          )
        }
      }
    }
  }

  walkContentsTreeForParseSuccess(projectContents, (fullPath, parseSuccess) => {
    fastForEach(parseSuccess.topLevelElements, (tle) => {
      if (isUtopiaJSXComponent(tle)) {
        extractUid(tle.rootElement)
      }
    })
  })

  return Array.from(uniqueIDs)
}

export const getAllUniqueUids = Utils.memoize(getAllUniqueUidsInner)

export function generateUidWithExistingComponents(projectContents: ProjectContentTreeRoot): string {
  const existingUIDS = getAllUniqueUids(projectContents)
  return generateUID(existingUIDS)
}

export function guaranteeUniqueUids(
  elements: Array<JSXElementChild>,
  existingIDs: Array<string>,
): Array<JSXElementChild> {
  return elements.map((element) => fixUtopiaElement(element, existingIDs))
}

function isSceneElement(
  element: JSXElementChild,
  filePath: string,
  projectContents: ProjectContentTreeRoot,
): boolean {
  const file = getContentsTreeFileFromString(projectContents, filePath)
  if (isTextFile(file) && isParseSuccess(file.fileContents.parsed)) {
    return isSceneAgainstImports(element, file.fileContents.parsed.imports)
  } else {
    return false
  }
}

export function getValidTemplatePaths(
  focusedElementPath: TemplatePath | null,
  topLevelElementName: string | null,
  instancePath: TemplatePath,
  projectContents: ProjectContentTreeRoot,
  filePath: string,
  resolve: (importOrigin: string, toImport: string) => Either<string, string>,
): Array<TemplatePath> {
  if (topLevelElementName == null) {
    return []
  }
  const file = getContentsTreeFileFromString(projectContents, filePath)
  if (isTextFile(file) && isParseSuccess(file.fileContents.parsed)) {
    const importSource = importedFromWhere(
      filePath,
      topLevelElementName,
      file.fileContents.parsed.topLevelElements,
      file.fileContents.parsed.imports,
    )
    if (importSource != null) {
      const resolvedImportSource = resolve(filePath, importSource)
      if (isRight(resolvedImportSource)) {
        const resolvedFilePath = resolvedImportSource.value
        const importSourceFile = getContentsTreeFileFromString(projectContents, resolvedFilePath)
        if (isTextFile(importSourceFile) && isParseSuccess(importSourceFile.fileContents.parsed)) {
          const topLevelElement = importSourceFile.fileContents.parsed.topLevelElements.find(
            (element): element is UtopiaJSXComponent =>
              isUtopiaJSXComponent(element) && element.name === topLevelElementName,
          )
          if (topLevelElement != null) {
            return getValidTemplatePathsFromElement(
              focusedElementPath,
              topLevelElement.rootElement,
              instancePath,
              projectContents,
              resolvedFilePath,
              false,
              true,
              resolve,
            )
          }
        }
      }
    }
  }
  return []
}

export function getValidTemplatePathsFromElement(
  focusedElementPath: TemplatePath | null,
  element: JSXElementChild,
  parentPath: TemplatePath,
  projectContents: ProjectContentTreeRoot,
  filePath: string,
  parentIsScene: boolean,
  parentIsInstance: boolean,
  resolve: (importOrigin: string, toImport: string) => Either<string, string>,
): Array<TemplatePath> {
  if (isJSXElement(element)) {
    const isScene = isSceneElement(element, filePath, projectContents)
    const uid = getUtopiaID(element)
    const path = parentIsInstance
      ? TP.appendNewElementPath(parentPath, uid)
      : TP.appendToPath(parentPath, uid)
    let paths = [path]
    fastForEach(element.children, (c) =>
      paths.push(
        ...getValidTemplatePathsFromElement(
          focusedElementPath,
          c,
          path,
          projectContents,
          filePath,
          isScene,
          false,
          resolve,
        ),
      ),
    )

    const name = getJSXElementNameAsString(element.name)
    const matchingFocusedPathPart =
      focusedElementPath == null
        ? null
        : TP.pathUpToElementPath(focusedElementPath, TP.elementPathForPath(path), 'static-path')

    const isFocused = parentIsScene || matchingFocusedPathPart != null
    if (isFocused) {
      paths = [
        ...paths,
        ...getValidTemplatePaths(
          focusedElementPath,
          name,
          matchingFocusedPathPart ?? path,
          projectContents,
          filePath,
          resolve,
        ),
      ]
    }

    return paths
  } else if (isJSXArbitraryBlock(element)) {
    let paths: Array<TemplatePath> = []
    fastForEach(Object.values(element.elementsWithin), (e) =>
      paths.push(
        ...getValidTemplatePathsFromElement(
          focusedElementPath,
          e,
          parentPath,
          projectContents,
          filePath,
          parentIsScene,
          parentIsInstance,
          resolve,
        ),
      ),
    )
    return paths
  } else if (isJSXFragment(element)) {
    let paths: Array<TemplatePath> = []
    fastForEach(Object.values(element.children), (e) =>
      paths.push(
        ...getValidTemplatePathsFromElement(
          focusedElementPath,
          e,
          parentPath,
          projectContents,
          filePath,
          parentIsScene,
          parentIsInstance,
          resolve,
        ),
      ),
    )
    return paths
  } else {
    return []
  }
}

// THIS IS SUPER UGLY, DO NOT USE OUTSIDE OF FILE
function isUtopiaJSXElement(
  element: JSXElementChild | ElementInstanceMetadata,
): element is JSXElement {
  return isJSXElement(element as any)
}
function isUtopiaJSXArbitraryBlock(
  element: JSXElementChild | ElementInstanceMetadata,
): element is JSXArbitraryBlock {
  return isJSXArbitraryBlock(element as any)
}
function isUtopiaJSXTextBlock(
  element: JSXElementChild | ElementInstanceMetadata,
): element is JSXTextBlock {
  return isJSXTextBlock(element as any)
}
function isElementInstanceMetadata(
  element: JSXElementChild | ElementInstanceMetadata,
): element is ElementInstanceMetadata {
  return (element as any).templatePath != null
}

export function setUtopiaID(element: JSXElementChild, uid: string): JSXElementChild {
  if (isUtopiaJSXElement(element)) {
    return setUtopiaIDOnJSXElement(element, uid)
  } else {
    throw new Error(`Unable to set utopia id on ${element.type}`)
  }
}

export function getUtopiaID(element: JSXElementChild | ElementInstanceMetadata): string {
  if (isUtopiaJSXElement(element)) {
    return getUtopiaIDFromJSXElement(element)
  } else if (isUtopiaJSXArbitraryBlock(element)) {
    return element.uniqueID
  } else if (isUtopiaJSXTextBlock(element)) {
    return element.uniqueID
  } else if (isElementInstanceMetadata(element)) {
    return TP.toUid(element.templatePath)
  } else if (isJSXFragment(element)) {
    return element.uniqueID
  }
  throw new Error(`Cannot recognize element ${JSON.stringify(element)}`)
}

export function elementSupportsChildren(imports: Imports, element: JSXElementChild): boolean {
  if (isJSXElement(element)) {
    if (isUtopiaAPIComponent(element.name, imports)) {
      return getJSXElementNameLastPart(element.name) === 'View'
    } else {
      // Be permissive about HTML elements.
      return true
    }
  } else {
    return false
  }
}

export function transformJSXComponentAtPath(
  components: Array<UtopiaJSXComponent>,
  path: StaticTemplatePath,
  transform: (elem: JSXElement) => JSXElement,
): Array<UtopiaJSXComponent> {
  return transformJSXComponentAtElementPath(components, TP.elementPathForPath(path), transform)
}

export function transformJSXComponentAtElementPath(
  components: Array<UtopiaJSXComponent>,
  path: StaticElementPath,
  transform: (elem: JSXElement) => JSXElement,
): Array<UtopiaJSXComponent> {
  const transformResult = transformAtPathOptionally(components, path, transform)

  if (transformResult.transformedElement == null) {
    throw new Error(`Did not find element to transform ${TP.elementPathToString(path)}`)
  } else {
    return transformResult.elements
  }
}

function transformAtPathOptionally(
  components: Array<UtopiaJSXComponent>,
  path: StaticElementPath,
  transform: (elem: JSXElement) => JSXElement,
): TP.ElementsTransformResult<UtopiaJSXComponent> {
  function findAndTransformAtPathInner(
    element: JSXElementChild,
    workingPath: string[],
  ): JSXElementChild | null {
    const [firstUIDOrIndex, ...tailPath] = workingPath
    if (isJSXElement(element)) {
      if (getUtopiaID(element) === firstUIDOrIndex) {
        // transform
        if (tailPath.length === 0) {
          return transform(element)
        } else {
          // we will want to transform one of our children
          let childrenUpdated: boolean = false
          const updatedChildren = element.children.map((child) => {
            const possibleUpdate = findAndTransformAtPathInner(child, tailPath)
            if (possibleUpdate != null) {
              childrenUpdated = true
            }
            return Utils.defaultIfNull(child, possibleUpdate)
          })
          if (childrenUpdated) {
            return {
              ...element,
              children: updatedChildren,
            }
          }
        }
      }
    } else if (isJSXArbitraryBlock(element)) {
      if (firstUIDOrIndex in element.elementsWithin) {
        const updated = findAndTransformAtPathInner(
          element.elementsWithin[firstUIDOrIndex],
          workingPath,
        )
        if (updated != null && isJSXElement(updated)) {
          const newElementsWithin: ElementsWithin = {
            ...element.elementsWithin,
            [firstUIDOrIndex]: updated,
          }
          return {
            ...element,
            elementsWithin: newElementsWithin,
          }
        }
      }
    } else if (isJSXFragment(element)) {
      let childrenUpdated: boolean = false
      const updatedChildren = element.children.map((child) => {
        const possibleUpdate = findAndTransformAtPathInner(child, workingPath)
        if (possibleUpdate != null) {
          childrenUpdated = true
        }
        return Utils.defaultIfNull(child, possibleUpdate)
      })
      if (childrenUpdated) {
        return {
          ...element,
          children: updatedChildren,
        }
      }
    }
    return null
  }

  let transformedElement: UtopiaJSXComponent | null = null
  const transformedElements = components.map((component) => {
    const updatedElement = findAndTransformAtPathInner(component.rootElement, path)
    if (updatedElement == null) {
      return component
    } else {
      const newComponent: UtopiaJSXComponent = {
        ...component,
        rootElement: updatedElement,
      }
      transformedElement = newComponent
      return newComponent
    }
  })

  return {
    elements: transformedElements,
    transformedElement: transformedElement,
  }
}

export function findJSXElementChildAtPath(
  components: Array<UtopiaJSXComponent>,
  path: StaticTemplatePath,
): JSXElementChild | null {
  function findAtPathInner(
    element: JSXElementChild,
    workingPath: Array<string>,
  ): JSXElementChild | null {
    const firstUIDOrIndex = workingPath[0]
    if (isJSXElement(element)) {
      const uid = getUtopiaID(element)
      if (uid === firstUIDOrIndex) {
        const tailPath = workingPath.slice(1)
        if (tailPath.length === 0) {
          // this is the element we want
          return element
        } else {
          // we will want to delve into the children
          const children = element.children
          for (const child of children) {
            const childResult = findAtPathInner(child, tailPath)
            if (childResult != null) {
              return childResult
            }
          }
        }
      }
    } else if (isJSXArbitraryBlock(element)) {
      if (firstUIDOrIndex in element.elementsWithin) {
        const elementWithin = element.elementsWithin[firstUIDOrIndex]
        const withinResult = findAtPathInner(elementWithin, workingPath)
        if (withinResult != null) {
          return withinResult
        }
      }
    } else if (isJSXFragment(element)) {
      const children = element.children
      for (const child of children) {
        const childResult = findAtPathInner(child, workingPath)
        if (childResult != null) {
          return childResult
        }
      }
    }
    return null
  }

  const pathElements = TP.elementPathForPath(path)
  for (const component of components) {
    const topLevelResult = findAtPathInner(component.rootElement, pathElements)
    if (topLevelResult != null) {
      return topLevelResult
    }
  }

  return null
}

export function findJSXElementAtStaticPath(
  components: Array<UtopiaJSXComponent>,
  path: StaticTemplatePath,
): JSXElement | null {
  const foundElement = findJSXElementChildAtPath(components, path)
  if (foundElement != null && isJSXElement(foundElement)) {
    return foundElement
  } else {
    return null
  }
}

export function removeJSXElementChild(
  target: StaticTemplatePath,
  rootElements: Array<UtopiaJSXComponent>,
): Array<UtopiaJSXComponent> {
  const parentPath = TP.parentPath(target)
  const targetID = TP.toUid(target)
  // Remove it from where it used to be.

  function removeRelevantChild<T extends JSXElementChild>(
    parentElement: T,
    descendIntoElements: boolean,
  ): T {
    if (isJSXElement(parentElement) && descendIntoElements) {
      let updatedChildren = parentElement.children.filter((child) => {
        return getUtopiaID(child) != targetID
      })
      updatedChildren = updatedChildren.map((child) => {
        return removeRelevantChild(child, false)
      })
      return {
        ...parentElement,
        children: updatedChildren,
      }
    } else if (isJSXFragment(parentElement)) {
      let updatedChildren = parentElement.children.filter((child) => {
        return getUtopiaID(child) != targetID
      })
      updatedChildren = updatedChildren.map((child) => removeRelevantChild(child, false))
      return {
        ...parentElement,
        children: updatedChildren,
      }
    } else {
      return parentElement
    }
  }
  return transformAtPathOptionally(
    rootElements,
    TP.elementPathForPath(parentPath),
    (parentElement: JSXElement) => {
      return removeRelevantChild(parentElement, true)
    },
  ).elements
}

export function insertJSXElementChild(
  projectContents: ProjectContentTreeRoot,
  openFile: string | null,
  targetParent: StaticTemplatePath | null,
  elementToInsert: JSXElementChild,
  components: Array<UtopiaJSXComponent>,
  indexPosition: IndexPosition | null,
): Array<UtopiaJSXComponent> {
  const makeE = () => {
    // TODO delete me
    throw new Error('Should not attempt to create empty elements.')
  }
  const targetParentIncludingStoryboardRoot =
    targetParent ?? getStoryboardTemplatePath(projectContents, openFile)
  if (targetParentIncludingStoryboardRoot == null) {
    return components
  } else {
    return transformJSXComponentAtPath(
      components,
      targetParentIncludingStoryboardRoot,
      (parentElement) => {
        if (isJSXElement(parentElement)) {
          let updatedChildren: Array<JSXElementChild>
          if (indexPosition == null) {
            updatedChildren = parentElement.children.concat(elementToInsert)
          } else {
            updatedChildren = Utils.addToArrayWithFill(
              elementToInsert,
              parentElement.children,
              indexPosition,
              makeE,
            )
          }
          return {
            ...parentElement,
            children: updatedChildren,
          }
        } else {
          return parentElement
        }
      },
    )
  }
}

export function getZIndexOfElement(
  topLevelElements: Array<TopLevelElement>,
  target: StaticTemplatePath,
): number {
  const parentPath = TP.parentPath(target)
  const parentElement = findJSXElementAtStaticPath(
    getComponentsFromTopLevelElements(topLevelElements),
    parentPath,
  )
  if (parentElement != null) {
    const elementUID = TP.toUid(target)
    return parentElement.children.findIndex((child) => {
      return isJSXElement(child) && getUtopiaID(child) === elementUID
    })
  } else {
    return -1
  }
}
