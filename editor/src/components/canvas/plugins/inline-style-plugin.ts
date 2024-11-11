import { getLayoutProperty } from '../../../core/layout/getLayoutProperty'
import type { StyleLayoutProp } from '../../../core/layout/layout-helpers-new'
import { MetadataUtils } from '../../../core/model/element-metadata-utils'
import { mapDropNulls } from '../../../core/shared/array-utils'
import { defaultEither, isLeft, mapEither, right } from '../../../core/shared/either'
import type { JSXElement } from '../../../core/shared/element-template'
import {
  emptyComments,
  isJSXElement,
  jsExpressionValue,
} from '../../../core/shared/element-template'
import * as PP from '../../../core/shared/property-path'
import { styleStringInArray } from '../../../utils/common-constants'
import type { ParsedCSSProperties } from '../../inspector/common/css-utils'
import { withPropertyTag, type WithPropertyTag } from '../canvas-types'
import { applyValuesAtPath, deleteValuesAtPath } from '../commands/utils/property-utils'
import type { StylePlugin } from './style-plugins'

function getPropertyFromInstance<P extends StyleLayoutProp, T = ParsedCSSProperties[P]>(
  prop: P,
  element: JSXElement,
): WithPropertyTag<T> | null {
  return defaultEither(
    null,
    mapEither(withPropertyTag, getLayoutProperty(prop, right(element.props), styleStringInArray)),
  ) as WithPropertyTag<T> | null
}

export const InlineStylePlugin: StylePlugin = {
  name: 'Inline Style',
  styleInfoFactory:
    ({ metadata }) =>
    (elementPath) => {
      const instance = MetadataUtils.findElementByElementPath(metadata, elementPath)
      if (instance == null || isLeft(instance.element) || !isJSXElement(instance.element.value)) {
        return null
      }

      const gap = getPropertyFromInstance('gap', instance.element.value)
      const flexDirection = getPropertyFromInstance('flexDirection', instance.element.value)

      return {
        gap: gap,
        flexDirection: flexDirection,
      }
    },
  updateStyles: (editorState, elementPath, updates) => {
    const propsToDelete = mapDropNulls(
      (update) => (update.type === 'delete' ? PP.create('style', update.property) : null),
      updates,
    )

    const propsToSet = mapDropNulls(
      (update) =>
        update.type === 'set'
          ? {
              path: PP.create('style', update.property),
              value: jsExpressionValue(update.value, emptyComments),
            }
          : null,
      updates,
    )

    const { editorStateWithChanges: withValuesDeleted } = deleteValuesAtPath(
      editorState,
      elementPath,
      propsToDelete,
    )

    return applyValuesAtPath(withValuesDeleted, elementPath, propsToSet)
  },
}
