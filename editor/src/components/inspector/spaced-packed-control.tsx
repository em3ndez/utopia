import React from 'react'
import { createSelector } from 'reselect'
import { assertNever } from '../../core/shared/utils'
import { ControlStatus, getControlStyles } from '../../uuiui-deps'
import { useSetHoveredControlsHandlers } from '../canvas/controls/select-mode/select-mode-hooks'
import {
  SubduedPaddingControlProps,
  SubduedPaddingControl,
} from '../canvas/controls/select-mode/subdued-padding-control'
import { EdgePieces } from '../canvas/padding-utils'
import { useDispatch } from '../editor/store/dispatch-context'
import { Substores, useEditorState, useRefEditorState } from '../editor/store/store-hook'
import { CanvasControlWithProps } from './common/inspector-atoms'
import { OptionChainControl, OptionChainOption } from './controls/option-chain-control'
import { metadataSelector, selectedViewsSelector } from './inpector-selectors'
import { detectPackedSpacedSetting, PackedSpaced } from './inspector-common'
import {
  setSpacingModePackedStrategies,
  setSpacingModeSpaceBetweenStrategies,
} from './inspector-strategies/inspector-strategies'
import { executeFirstApplicableStrategy } from './inspector-strategies/inspector-strategy'
import { UIGridRow } from './widgets/ui-grid-row'

export const SpacedPackedControlTestId = 'SpacedPackedControlTestId'

export const PackedLabelCopy = 'Packed' as const
export const SpacedLabelCopy = 'Spaced' as const

const OverflowControlOptions: Array<OptionChainOption<PackedSpaced>> = [
  {
    tooltip: PackedLabelCopy,
    label: PackedLabelCopy,
    value: 'packed',
  },
  {
    tooltip: SpacedLabelCopy,
    label: SpacedLabelCopy,
    value: 'spaced',
  },
]

const packedSpacedSelector = createSelector(
  metadataSelector,
  selectedViewsSelector,
  detectPackedSpacedSetting,
)

export const SpacedPackedControl = React.memo(() => {
  const metadataRef = useRefEditorState((store) => store.editor.jsxMetadata)
  const selectedViewsRef = useRefEditorState((store) => store.editor.selectedViews)
  const allElementPropsRef = useRefEditorState((store) => store.editor.allElementProps)

  const dispatch = useDispatch()

  const spacedPackedSetting = useEditorState(Substores.metadata, packedSpacedSelector, '')

  const onUpdate = React.useCallback(
    (value: PackedSpaced) => {
      switch (value) {
        case 'packed':
          return executeFirstApplicableStrategy(
            dispatch,
            metadataRef.current,
            selectedViewsRef.current,
            allElementPropsRef.current,
            setSpacingModePackedStrategies,
          )
        case 'spaced':
          return executeFirstApplicableStrategy(
            dispatch,
            metadataRef.current,
            selectedViewsRef.current,
            allElementPropsRef.current,
            setSpacingModeSpaceBetweenStrategies,
          )
        default:
          assertNever(value)
      }
    },
    [allElementPropsRef, dispatch, metadataRef, selectedViewsRef],
  )

  const paddingControlsForHover: Array<CanvasControlWithProps<SubduedPaddingControlProps>> =
    React.useMemo(
      () =>
        EdgePieces.map((side) => ({
          control: SubduedPaddingControl,
          props: {
            side: side,
            hoveredOrFocused: 'hovered',
          },
          key: `subdued-padding-control-hovered-${side}`,
        })),
      [],
    )

  const { onMouseEnter, onMouseLeave } = useSetHoveredControlsHandlers<SubduedPaddingControlProps>()
  const onMouseEnterWithPaddingControls = React.useCallback(
    () => onMouseEnter(paddingControlsForHover),
    [onMouseEnter, paddingControlsForHover],
  )

  const controlStatus: ControlStatus = 'simple'
  return (
    <UIGridRow
      data-testid={SpacedPackedControlTestId}
      onMouseEnter={onMouseEnterWithPaddingControls}
      onMouseLeave={onMouseLeave}
      padded={true}
      variant='<---1fr--->|------172px-------|'
    >
      Spacing
      <OptionChainControl
        id={'spaced-packed-control'}
        key={'spaced-packed-control'}
        testId={'spaced-packed-control'}
        onSubmitValue={onUpdate}
        value={spacedPackedSetting}
        options={OverflowControlOptions}
        controlStatus={controlStatus}
        controlStyles={getControlStyles(controlStatus)}
      />
    </UIGridRow>
  )
})
