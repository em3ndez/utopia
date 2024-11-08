import { MetadataUtils } from '../../../../core/model/element-metadata-utils'
import { generateUidWithExistingComponents } from '../../../../core/model/element-template-utils'
import * as EP from '../../../../core/shared/element-path'
import { isInfinityRectangle } from '../../../../core/shared/math-utils'
import { CSSCursor } from '../../../../uuiui-deps'
import { duplicateElement } from '../../commands/duplicate-element-command'
import { setCursorCommand } from '../../commands/set-cursor-command'

import { updateHighlightedViews } from '../../commands/update-highlighted-views-command'
import { updateSelectedViews } from '../../commands/update-selected-views-command'
import { controlsForGridPlaceholders } from '../../controls/grid-controls-for-strategies'
import type { CanvasStrategyFactory } from '../canvas-strategies'
import { onlyFitWhenDraggingThisControl } from '../canvas-strategies'
import type { CustomStrategyState, InteractionCanvasState } from '../canvas-strategy-types'
import {
  emptyStrategyApplicationResult,
  getTargetPathsFromInteractionTarget,
  strategyApplicationResult,
} from '../canvas-strategy-types'
import type { InteractionSession } from '../interaction-state'
import {
  findOriginalGrid,
  getParentGridTemplatesFromChildMeasurements,
  gridMoveStrategiesExtraCommands,
} from './grid-helpers'
import { runGridChangeElementLocation } from './grid-change-element-location-strategy'

export const gridChangeElementLocationDuplicateStrategy: CanvasStrategyFactory = (
  canvasState: InteractionCanvasState,
  interactionSession: InteractionSession | null,
  customState: CustomStrategyState,
) => {
  const selectedElements = getTargetPathsFromInteractionTarget(canvasState.interactionTarget)
  if (
    selectedElements.length === 0 ||
    interactionSession == null ||
    interactionSession.interactionData.type !== 'DRAG' ||
    interactionSession.interactionData.drag == null ||
    interactionSession.activeControl.type !== 'GRID_CELL_HANDLE' ||
    !interactionSession.interactionData.modifiers.alt
  ) {
    return null
  }

  const selectedElement = selectedElements[0]
  if (!MetadataUtils.isGridItem(canvasState.startingMetadata, selectedElement)) {
    return null
  }

  const selectedElementMetadata = MetadataUtils.findElementByElementPath(
    canvasState.startingMetadata,
    selectedElement,
  )
  if (
    selectedElementMetadata == null ||
    !MetadataUtils.targetRegisteredStyleControlsOrHonoursStyleProps(
      canvasState.projectContents,
      selectedElementMetadata,
      canvasState.propertyControlsInfo,
      'layout',
      ['gridRow', 'gridColumn', 'gridRowStart', 'gridColumnStart', 'gridRowEnd', 'gridColumnEnd'],
      'some',
    )
  ) {
    return null
  }

  const initialTemplates = getParentGridTemplatesFromChildMeasurements(
    selectedElementMetadata.specialSizeMeasurements,
  )
  if (initialTemplates == null) {
    return null
  }

  const parentGridPath = findOriginalGrid(
    canvasState.startingMetadata,
    EP.parentPath(selectedElement),
  ) // TODO don't use EP.parentPath
  if (parentGridPath == null) {
    return null
  }

  const gridFrame = MetadataUtils.findElementByElementPath(
    canvasState.startingMetadata,
    parentGridPath,
  )?.globalFrame
  if (gridFrame == null || isInfinityRectangle(gridFrame)) {
    return null
  }

  return {
    id: 'grid-change-element-location-duplicate-strategy',
    name: 'Change Location (Duplicate)',
    descriptiveLabel: 'Change Location (Duplicate)',
    icon: {
      category: 'tools',
      type: 'pointer',
    },
    controlsToRender: [controlsForGridPlaceholders(parentGridPath)],
    fitness: onlyFitWhenDraggingThisControl(interactionSession, 'GRID_CELL_HANDLE', 3),
    apply: () => {
      if (
        interactionSession == null ||
        interactionSession.interactionData.type !== 'DRAG' ||
        interactionSession.interactionData.drag == null ||
        interactionSession.activeControl.type !== 'GRID_CELL_HANDLE'
      ) {
        return emptyStrategyApplicationResult
      }

      const oldUid = EP.toUid(selectedElement)

      let duplicatedElementNewUids = { ...customState.duplicatedElementNewUids }
      let newUid = duplicatedElementNewUids[oldUid]
      if (newUid == null) {
        newUid = 'dup-' + generateUidWithExistingComponents(canvasState.projectContents)
        duplicatedElementNewUids[oldUid] = newUid
      }

      const targetElement = EP.appendToPath(parentGridPath, newUid)

      const { parentGridCellGlobalFrames, parentContainerGridProperties } =
        selectedElementMetadata.specialSizeMeasurements
      if (parentGridCellGlobalFrames == null) {
        return emptyStrategyApplicationResult
      }

      const moveCommands = runGridChangeElementLocation(
        canvasState.startingMetadata,
        interactionSession.interactionData,
        selectedElementMetadata,
        parentGridPath,
        parentGridCellGlobalFrames,
        parentContainerGridProperties,
        null,
      )

      const { midInteractionCommands, onCompleteCommands } = gridMoveStrategiesExtraCommands(
        parentGridPath,
        initialTemplates,
      )

      return strategyApplicationResult(
        [
          duplicateElement('always', selectedElement, newUid),
          ...moveCommands,
          ...midInteractionCommands,
          ...onCompleteCommands,
          updateSelectedViews('always', [targetElement]),
          updateHighlightedViews('always', [targetElement]),
          setCursorCommand(CSSCursor.Duplicate),
        ],
        [...selectedElements, targetElement],
        {
          duplicatedElementNewUids: duplicatedElementNewUids,
        },
      )
    },
  }
}
