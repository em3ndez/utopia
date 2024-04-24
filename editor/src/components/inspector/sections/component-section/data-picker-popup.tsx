/** @jsxRuntime classic */
/** @jsxFrag */
/** @jsx jsx */
import { jsx } from '@emotion/react'
import React, { useCallback } from 'react'
import { jsExpressionOtherJavaScriptSimple } from '../../../../core/shared/element-template'
import { optionalMap } from '../../../../core/shared/optional-utils'
import type { PropertyPath } from '../../../../core/shared/project-file-types'
import {
  useColorTheme,
  Button,
  FlexColumn,
  UtopiaStyles,
  UtopiaTheme,
  SquareButton,
  PopupList,
} from '../../../../uuiui'
import { setProp_UNSAFE } from '../../../editor/actions/action-creators'
import { useDispatch } from '../../../editor/store/dispatch-context'
import { useRefEditorState } from '../../../editor/store/store-hook'
import { UIGridRow } from '../../widgets/ui-grid-row'
import { DataPickerPopupTestId, VariableFromScopeOptionTestId } from './component-section'
import * as EP from '../../../../core/shared/element-path'
import * as PP from '../../../../core/shared/property-path'
import type {
  ArrayInfo,
  JSXInfo,
  ObjectInfo,
  PrimitiveInfo,
  VariableInfo,
} from './variables-in-scope-utils'
import { useVariablesInScopeForSelectedElement } from './variables-in-scope-utils'
import { NO_OP, arrayEqualsByValue, assertNever } from '../../../../core/shared/utils'
import { isPrefixOf } from '../../../../core/shared/array-utils'
import { ExpandableIndicator } from '../../../navigator/navigator-item/expandable-indicator'
import { FlexRow } from 'utopia-api'
import { is } from '../../../../core/shared/equality-utils'
import { atom, useAtom } from 'jotai'
import type { SelectOption } from '../../controls/select-control'
import { InspectorModal } from '../../widgets/inspector-modal'

export interface PrimitiveOption {
  type: 'primitive'
  variableInfo: PrimitiveInfo
  definedElsewhere: string
  depth: number
  valuePath: Array<string | number>
}

export interface ArrayOption {
  type: 'array'
  variableInfo: ArrayInfo
  depth: number
  definedElsewhere: string
  children: Array<VariableOption>
  valuePath: Array<string | number>
}

export interface ObjectOption {
  type: 'object'
  variableInfo: ObjectInfo
  depth: number
  definedElsewhere: string
  children: Array<VariableOption>
  valuePath: Array<string | number>
}

export interface JSXOption {
  type: 'jsx'
  variableInfo: JSXInfo
  definedElsewhere: string
  depth: number
  valuePath: Array<string | number>
}

export type VariableOption = PrimitiveOption | ArrayOption | ObjectOption | JSXOption

const DataPickerFilterOptions = ['all', 'preferred'] as const
export type DataPickerFilterOption = (typeof DataPickerFilterOptions)[number]
export function dataPickerFilterOptionToString(mode: DataPickerFilterOption): string {
  switch (mode) {
    case 'all':
      return 'All'
    case 'preferred':
      return 'Preferred'
    default:
      assertNever(mode)
  }
}

export const DataPickerPreferredAllAtom = atom<DataPickerFilterOption>('preferred')

function valueToDisplay(option: VariableOption): string {
  switch (option.variableInfo.type) {
    case 'array':
      return `[]`
    case 'object':
      return `{}`
    case 'primitive':
      return `${option.variableInfo.value}`
    case 'jsx':
      return `JSX`
    default:
      assertNever(option.variableInfo)
  }
}

function isChildrenProp(path: PropertyPath): boolean {
  return (
    path.propertyElements.length > 0 &&
    typeof path.propertyElements[0] === 'string' &&
    path.propertyElements[0] === 'children'
  )
}

export interface DataPickerPopupProps {
  closePopup: () => void
  style: React.CSSProperties
  propPath: PropertyPath
  propExpressionPath: Array<string | number> | null
}

export const DataPickerPopup = React.memo(
  React.forwardRef<HTMLDivElement, DataPickerPopupProps>((props, forwardedRef) => {
    const { closePopup, propPath, propExpressionPath } = props

    const [preferredAllState, setPreferredAllState] = useAtom(DataPickerPreferredAllAtom)

    const selectedViewPathRef = useRefEditorState(
      (store) => store.editor.selectedViews.at(0) ?? null,
    )

    const colorTheme = useColorTheme()
    const dispatch = useDispatch()
    const isTargetingChildrenProp = isChildrenProp(propPath)

    const setMode = React.useCallback(
      (option: SelectOption<DataPickerFilterOption>) => {
        setPreferredAllState(option.value)
      },
      [setPreferredAllState],
    )

    const onTweakProperty = React.useCallback(
      (name: string, definedElsewhere: string | null) => (e: React.MouseEvent) => {
        if (selectedViewPathRef.current == null) {
          return
        }

        e.stopPropagation()
        e.preventDefault()

        const definedElseWhereArray = optionalMap((d) => [d], definedElsewhere) ?? []
        const expression = jsExpressionOtherJavaScriptSimple(name, definedElseWhereArray)

        if (isTargetingChildrenProp) {
          dispatch([
            {
              action: 'INSERT_ATTRIBUTE_OTHER_JAVASCRIPT_INTO_ELEMENT',
              expression: expression,
              parent: selectedViewPathRef.current,
            },
          ])
          return
        }

        dispatch([setProp_UNSAFE(selectedViewPathRef.current, propPath, expression)])
      },
      [dispatch, isTargetingChildrenProp, propPath, selectedViewPathRef],
    )

    const variableNamesInScope = useVariablesInScopeForSelectedElement(
      selectedViewPathRef.current ?? EP.emptyElementPath,
      props.propPath,
      preferredAllState,
    )

    const filterOptions = React.useMemo(
      () =>
        DataPickerFilterOptions.map((option) => ({
          value: option,
          label: dataPickerFilterOptionToString(option),
        })),
      [],
    )

    return (
      <InspectorModal
        offsetX={0}
        offsetY={0}
        closePopup={props.closePopup}
        style={{
          zIndex: 1,
        }}
        closePopupOnUnmount={false}
        outsideClickIgnoreClass={`ignore-react-onclickoutside-data-picker-${PP.toString(propPath)}`}
      >
        <div // this entire wrapper div was made before using the InspectorModal, so it should be re-done
          style={{
            background: 'transparent',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1, // so it's above the inspector
          }}
          onClick={closePopup}
        >
          <FlexColumn
            ref={forwardedRef}
            tabIndex={0}
            style={{
              ...props.style,
              left: -5, // to make it align with the inspector
              backgroundColor: colorTheme.neutralBackground.value,
              padding: '8px 4px',
              boxShadow: UtopiaStyles.shadowStyles.mid.boxShadow,
              border: '1px solid lightgrey',
              borderRadius: 4,
              alignItems: 'flex-start',
              width: '96%',
              maxWidth: '260px',
            }}
            data-testid={DataPickerPopupTestId}
          >
            <UIGridRow
              padded
              variant='<-------1fr------>|----80px----|'
              css={{ marginBottom: 4, alignSelf: 'stretch' }}
            >
              <div style={{ fontWeight: 600, flexGrow: 1 }}>Data</div>
              <PopupList
                containerMode='showBorderOnHover'
                options={filterOptions}
                value={{
                  value: preferredAllState,
                  label: dataPickerFilterOptionToString(preferredAllState),
                }}
                onSubmitValue={setMode}
              />
            </UIGridRow>
            {variableNamesInScope.map((variableOption, idx) => {
              return (
                <ValueRow
                  key={variableOption.valuePath.toString()}
                  variableOption={variableOption}
                  idx={`${idx}`}
                  onTweakProperty={onTweakProperty}
                  currentPropExpressionPath={propExpressionPath}
                />
              )
            })}
          </FlexColumn>
        </div>
      </InspectorModal>
    )
  }),
)

interface ValueRowProps {
  variableOption: VariableOption
  idx: string
  onTweakProperty: (name: string, definedElsewhere: string | null) => (e: React.MouseEvent) => void
  currentPropExpressionPath: Array<string | number> | null
  overriddenTitle?: string
}

const anyObjectChildMatches = (info: VariableInfo): boolean =>
  info.type === 'object' && info.props.some((c) => c.matches || anyObjectChildMatches(c))

function ValueRow({
  variableOption,
  idx,
  onTweakProperty,
  currentPropExpressionPath,
  overriddenTitle,
}: ValueRowProps) {
  const colorTheme = useColorTheme()
  const [selectedIndex, setSelectedIndex] = React.useState<number>(0)

  const childrenLength = variableOption.type === 'array' ? variableOption.children.length : Infinity
  const childrenOpenByDefault =
    variableOption.depth < 2 ||
    childrenLength < 4 ||
    anyObjectChildMatches(variableOption.variableInfo)

  const [childrenOpen, setChildrenOpen] = React.useState<boolean>(childrenOpenByDefault)

  const toggleChildrenOpen = useCallback(() => {
    setChildrenOpen(!childrenOpen)
  }, [childrenOpen, setChildrenOpen])

  const isArray = variableOption.variableInfo.type === 'array'

  const tweakProperty = onTweakProperty(
    variableOption.variableInfo.expression,
    variableOption.definedElsewhere,
  )
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const variableChildren =
    variableOption.type === 'array' || variableOption.type === 'object'
      ? variableOption.children
      : null

  const hasObjectChildren = variableOption.type === 'object' && variableOption.children.length > 0

  const currentExpressionExactMatch =
    currentPropExpressionPath != null &&
    arrayEqualsByValue(variableOption.valuePath, currentPropExpressionPath, is)

  return (
    <>
      <Button
        data-testid={VariableFromScopeOptionTestId(idx)}
        style={{
          borderRadius: 8,
          width: '100%',
          height: 29,
          marginTop: variableChildren != null && variableOption.depth === 0 ? 12 : 0, // add some space between top-level variables
          cursor: variableOption.variableInfo.matches ? 'pointer' : 'default',
          background: currentExpressionExactMatch
            ? colorTheme.secondaryBackground.value
            : undefined,
        }}
        onClick={isArray ? stopPropagation : tweakProperty}
        css={{
          '&:hover': {
            backgroundColor: variableOption.variableInfo.matches
              ? colorTheme.secondaryBackground.value
              : 'inherit',
          },
        }}
      >
        <UIGridRow
          padded
          variant='<--1fr--><--1fr-->'
          style={{
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
            width: '100%',
            minHeight: 'auto',
            gridTemplateColumns: '48% 48%',
          }}
        >
          <div onClick={tweakProperty} data-label='left column cell'>
            <div
              data-testid={`variable-from-scope-span-${variableOption.valuePath}`}
              style={{ display: 'grid', gridTemplateColumns: '16px 1fr' }}
            >
              <PrefixIcon
                hasObjectChildren={hasObjectChildren}
                onIconClick={toggleChildrenOpen}
                open={childrenOpen}
              />
              <span
                data-testid='variable-name'
                style={{
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  opacity: variableOption.variableInfo.matches ? 1 : 0.5,
                }}
              >
                {overriddenTitle ?? variableOption.variableInfo.expressionPathPart}
              </span>
            </div>
          </div>

          <div
            data-label='right-column cell'
            style={{
              display: 'flex',
              width: '94%',
            }}
            onClick={isArray ? stopPropagation : tweakProperty}
          >
            <span
              style={{
                fontWeight: 400,
                color: colorTheme.neutralForeground.value,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 130,
                overflow: 'hidden',
                opacity: variableOption.variableInfo.matches ? 1 : 0.5,
              }}
            >
              {isArray ? (
                <ArrayPaginator
                  selectedIndex={selectedIndex}
                  totalChildCount={childrenLength}
                  setSelectedIndex={setSelectedIndex}
                />
              ) : (
                <div style={{ opacity: 0.3 }}>{valueToDisplay(variableOption)}</div>
              )}
            </span>
          </div>
        </UIGridRow>
      </Button>
      {variableChildren != null ? (
        isArray ? (
          <ValueRow
            key={variableChildren[selectedIndex].valuePath.toString()}
            variableOption={variableChildren[selectedIndex]}
            idx={`${idx}-${selectedIndex}`}
            onTweakProperty={onTweakProperty}
            currentPropExpressionPath={currentPropExpressionPath}
            overriddenTitle={`${variableOption.variableInfo.expressionPathPart}[${selectedIndex}]`}
          />
        ) : childrenOpen ? (
          variableChildren.map((child, index) => {
            return (
              <ValueRow
                key={child.valuePath.toString()}
                variableOption={child}
                idx={`${idx}-${index}`}
                onTweakProperty={onTweakProperty}
                currentPropExpressionPath={currentPropExpressionPath}
              />
            )
          })
        ) : null
      ) : null}
    </>
  )
}

function PrefixIcon({
  hasObjectChildren,
  onIconClick,
  open,
}: {
  hasObjectChildren: boolean
  onIconClick: () => void
  open: boolean
}) {
  const colorTheme = useColorTheme()
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onIconClick()
    },
    [onIconClick],
  )

  return (
    <span
      css={{
        color: colorTheme.neutralBorder.value,
        fontSize: 6,
        ...style,
      }}
      onClick={onClick}
    >
      {hasObjectChildren ? (
        <ExpandableIndicator visible collapsed={!open} selected={false} />
      ) : null}
    </span>
  )
}

function ArrayPaginator({
  selectedIndex,
  totalChildCount,
  setSelectedIndex,
}: {
  selectedIndex: number
  totalChildCount: number
  setSelectedIndex: (index: number) => void
}) {
  const colorTheme = useColorTheme()
  const increaseIndex = useCallback(() => {
    setSelectedIndex(Math.min(totalChildCount - 1, selectedIndex + 1))
  }, [selectedIndex, setSelectedIndex, totalChildCount])
  const decreaseIndex = useCallback(() => {
    setSelectedIndex(Math.max(0, selectedIndex - 1))
  }, [selectedIndex, setSelectedIndex])
  return (
    <FlexRow
      css={{
        alignItems: 'center',
        fontSize: 10,
        color: colorTheme.neutralForeground.value,
      }}
    >
      <div onClick={decreaseIndex} style={{ cursor: 'pointer', paddingLeft: 4, paddingRight: 4 }}>
        {'< '}
      </div>
      <span>
        {selectedIndex + 1} / {totalChildCount}
      </span>
      <span onClick={increaseIndex} style={{ cursor: 'pointer', paddingLeft: 4, paddingRight: 4 }}>
        {' >'}
      </span>
    </FlexRow>
  )
}
