import React from 'react'
import { MetadataUtils } from '../../../../../core/model/element-metadata-utils'
import { strictEvery } from '../../../../../core/shared/array-utils'
import { InspectorContextMenuWrapper } from '../../../../context-menu-wrapper'
import { applyCommandsAction } from '../../../../editor/actions/action-creators'
import { useDispatch } from '../../../../editor/store/dispatch-context'
import { Substores, useEditorState, useRefEditorState } from '../../../../editor/store/store-hook'
import { ControlStatus, getControlStyles } from '../../../common/control-status'
import { cssNumber } from '../../../common/css-utils'
import { OptionChainControl, OptionChainOption } from '../../../controls/option-chain-control'
import {
  metadataSelector,
  selectedViewsSelector,
  useComputedSizeRef,
} from '../../../inpector-selectors'
import {
  detectFillHugFixedState,
  FixedHugFill,
  isFixedHugFillEqual,
} from '../../../inspector-common'
import {
  setPropFixedStrategies,
  setPropHugStrategies,
} from '../../../inspector-strategies/inspector-strategies'
import { commandsForFirstApplicableStrategy } from '../../../inspector-strategies/inspector-strategy'

export const TextAutoSizingTestId = 'textAutoSizing'

function useAutoSizingTypeAndStatus(): { status: ControlStatus; type: 'fixed' | 'hug' | null } {
  const isEditableText = useEditorState(
    Substores.metadata,
    (store) => {
      return strictEvery(store.editor.selectedViews, (path) =>
        MetadataUtils.targetTextEditableAndHasText(store.editor.jsxMetadata, path),
      )
    },
    'TextAutoSizingControl isEditableText',
  )

  const widthFillHugFixedState = useEditorState(
    Substores.metadata,
    (store) => {
      const target = store.editor.selectedViews[0]
      return detectFillHugFixedState('horizontal', store.editor.jsxMetadata, target)
    },
    'TextAutoSizingControl fixedHugFillState width',
    isFixedHugFillEqual,
  )

  const heightFillHugFixedState = useEditorState(
    Substores.metadata,
    (store) => {
      const target = store.editor.selectedViews[0]
      return detectFillHugFixedState('vertical', store.editor.jsxMetadata, target)
    },
    'TextAutoSizingControl fixedHugFillState height',
    isFixedHugFillEqual,
  )

  let fixedHugState: FixedHugFill | null = null
  if (
    widthFillHugFixedState.fixedHugFill != null &&
    widthFillHugFixedState.fixedHugFill.type !== 'fill' &&
    heightFillHugFixedState.fixedHugFill != null &&
    heightFillHugFixedState.fixedHugFill.type !== 'fill'
  ) {
    if (widthFillHugFixedState.fixedHugFill.type === heightFillHugFixedState.fixedHugFill.type) {
      fixedHugState = widthFillHugFixedState.fixedHugFill
    }
  }

  const controlStatus = React.useMemo(() => {
    if (!isEditableText) {
      return 'disabled'
    } else {
      return widthFillHugFixedState.controlStatus
    }
  }, [widthFillHugFixedState, isEditableText])

  const type =
    controlStatus === 'disabled' || controlStatus === 'unset' ? null : fixedHugState?.type ?? null

  return { status: controlStatus, type: type }
}

export const TextAutoSizingControl = React.memo(() => {
  const dispatch = useDispatch()
  const metadataRef = useRefEditorState(metadataSelector)
  const selectedViewsRef = useRefEditorState(selectedViewsSelector)

  const controlStatusAndValueType = useAutoSizingTypeAndStatus()
  const controlStyles = React.useMemo(
    () => getControlStyles(controlStatusAndValueType.status),
    [controlStatusAndValueType],
  )

  const widthComputedValue = useComputedSizeRef('width')
  const heightComputedValue = useComputedSizeRef('height')

  const onSubmitValue = React.useCallback(
    (newValue: any) => {
      if (newValue === 'fixed') {
        const widthCommands =
          commandsForFirstApplicableStrategy(
            metadataRef.current,
            selectedViewsRef.current,
            setPropFixedStrategies(
              'always',
              'horizontal',
              cssNumber(widthComputedValue.current ?? 0, null),
            ),
          ) ?? []
        const heightCommands =
          commandsForFirstApplicableStrategy(
            metadataRef.current,
            selectedViewsRef.current,
            setPropFixedStrategies(
              'always',
              'vertical',
              cssNumber(heightComputedValue.current ?? 0, null),
            ),
          ) ?? []
        dispatch([applyCommandsAction([...widthCommands, ...heightCommands])])
      } else {
        const widthCommands =
          commandsForFirstApplicableStrategy(
            metadataRef.current,
            selectedViewsRef.current,
            setPropHugStrategies('horizontal'),
          ) ?? []
        const heightCommands =
          commandsForFirstApplicableStrategy(
            metadataRef.current,
            selectedViewsRef.current,
            setPropHugStrategies('vertical'),
          ) ?? []
        dispatch([applyCommandsAction([...widthCommands, ...heightCommands])])
      }
    },
    [dispatch, metadataRef, selectedViewsRef, widthComputedValue, heightComputedValue],
  )

  return (
    <InspectorContextMenuWrapper
      id='textSizing-context-menu'
      items={[]}
      data={null}
      style={{ gridColumn: '1 / span 2' }}
    >
      <OptionChainControl
        id='textAutoSizing'
        key='textAutoSizing'
        testId={TextAutoSizingTestId}
        controlStatus={controlStatusAndValueType.status}
        controlStyles={controlStyles}
        onSubmitValue={onSubmitValue}
        value={controlStatusAndValueType.type}
        options={
          [
            {
              value: 'hug',
              tooltip: 'Auto',
              icon: {
                category: 'typography',
                type: 'auto',
                color: 'secondary',
                width: 16,
                height: 16,
              },
            },
            {
              value: 'fixed',
              tooltip: 'Fixed',
              icon: {
                category: 'typography',
                type: 'fixed',
                color: 'secondary',
                width: 16,
                height: 16,
              },
            },
          ] as Array<OptionChainOption<string | number>>
        }
      />
    </InspectorContextMenuWrapper>
  )
})
