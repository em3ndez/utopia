import { act, createEvent, fireEvent } from '@testing-library/react'
import { emptyModifiers, Modifiers } from '../../utils/modifiers'
import { resetMouseStatus } from '../mouse-move'
import keycode from 'keycode'
import { NO_OP } from '../../core/shared/utils'
import { defer } from '../../utils/utils'
import { extractUtopiaDataFromHtml } from '../../utils/clipboard-utils'
import Sinon from 'sinon'
import { ClipboardDataPayload, Clipboard } from '../../utils/clipboard'

// TODO Should the mouse move and mouse up events actually be fired at the parent of the event source?
// Or document.body?

interface Point {
  x: number
  y: number
}

export async function mouseDownAtPoint(
  eventSourceElement: HTMLElement,
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
  } = {},
): Promise<void> {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mousedown', {
        detail: 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
  })
}

export async function mouseMoveToPoint(
  eventSourceElement: HTMLElement,
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
  } = {},
): Promise<void> {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        movementX: 1,
        movementY: 1,
        ...eventOptions,
      }),
    )
  })

  resetMouseStatus()
}

export async function mouseEnterAtPoint(
  eventSourceElement: HTMLElement,
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
  } = {},
): Promise<void> {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        ...eventOptions,
      }),
    )
  })

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        ...eventOptions,
      }),
    )
  })
}

export async function mouseUpAtPoint(
  eventSourceElement: HTMLElement,
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
  } = {},
): Promise<void> {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseup', {
        detail: 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        ...eventOptions,
      }),
    )
  })
}

export async function mouseDragFromPointWithDelta(
  eventSourceElement: HTMLElement,
  startPoint: Point,
  dragDelta: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
    staggerMoveEvents?: boolean
    midDragCallback?: () => Promise<void>
  } = {},
): Promise<void> {
  const endPoint: Point = {
    x: startPoint.x + dragDelta.x,
    y: startPoint.y + dragDelta.y,
  }
  return mouseDragFromPointToPoint(eventSourceElement, startPoint, endPoint, options)
}

export async function mouseDragFromPointToPoint(
  eventSourceElement: HTMLElement,
  startPoint: Point,
  endPoint: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
    staggerMoveEvents?: boolean
    midDragCallback?: () => Promise<void>
    moveBeforeMouseDown?: boolean
  } = {},
): Promise<void> {
  const { buttons, ...mouseUpOptions } = options.eventOptions ?? {}
  const staggerMoveEvents = options.staggerMoveEvents ?? true

  const delta: Point = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y,
  }

  if (options.moveBeforeMouseDown) {
    await mouseMoveToPoint(eventSourceElement, startPoint, options)
  }
  await mouseDownAtPoint(eventSourceElement, startPoint, options)

  if (staggerMoveEvents) {
    const numberOfSteps = 5
    for (let step = 1; step < numberOfSteps + 1; step++) {
      const stepSize: Point = {
        x: delta.x / numberOfSteps,
        y: delta.y / numberOfSteps,
      }

      await mouseMoveToPoint(
        eventSourceElement,
        {
          x: startPoint.x + step * stepSize.x,
          y: startPoint.y + step * stepSize.y,
        },
        {
          ...options,
          eventOptions: {
            movementX: stepSize.x,
            movementY: stepSize.y,
            buttons: 1,
            ...options.eventOptions,
          },
        },
      )
    }
  } else {
    await mouseMoveToPoint(
      eventSourceElement,
      {
        x: endPoint.x,
        y: endPoint.y,
      },
      {
        ...options,
        eventOptions: {
          movementX: delta.x,
          movementY: delta.y,
          buttons: 1,
          ...options.eventOptions,
        },
      },
    )
  }

  if (options.midDragCallback != null) {
    await options.midDragCallback()
  }

  await mouseUpAtPoint(eventSourceElement, endPoint, {
    ...options,
    eventOptions: mouseUpOptions,
  })
}

export async function mouseDragFromPointToPointNoMouseDown(
  eventSourceElement: HTMLElement,
  startPoint: Point,
  endPoint: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
    staggerMoveEvents?: boolean
    midDragCallback?: () => Promise<void>
  } = {},
): Promise<void> {
  const { buttons, ...mouseUpOptions } = options.eventOptions ?? {}
  const staggerMoveEvents = options.staggerMoveEvents ?? true

  const delta: Point = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y,
  }

  if (staggerMoveEvents) {
    const numberOfSteps = 5
    for (let step = 1; step < numberOfSteps + 1; step++) {
      const stepSize: Point = {
        x: delta.x / numberOfSteps,
        y: delta.y / numberOfSteps,
      }

      await mouseMoveToPoint(
        eventSourceElement,
        {
          x: startPoint.x + step * stepSize.x,
          y: startPoint.y + step * stepSize.y,
        },
        {
          ...options,
          eventOptions: {
            movementX: stepSize.x,
            movementY: stepSize.y,
            buttons: 1,
            ...options.eventOptions,
          },
        },
      )
    }
  } else {
    await mouseMoveToPoint(
      eventSourceElement,
      {
        x: endPoint.x,
        y: endPoint.y,
      },
      {
        ...options,
        eventOptions: {
          movementX: delta.x,
          movementY: delta.y,
          buttons: 1,
          ...options.eventOptions,
        },
      },
    )
  }

  if (options.midDragCallback != null) {
    await options.midDragCallback()
  }

  await mouseUpAtPoint(eventSourceElement, endPoint, {
    ...options,
    eventOptions: mouseUpOptions,
  })
}

export async function mouseClickAtPoint(
  eventSourceElement: HTMLElement,
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
  } = {},
): Promise<void> {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }
  const { buttons, ...mouseUpOptions } = eventOptions ?? {}

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mousedown', {
        detail: 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )

    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseup', {
        detail: 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...mouseUpOptions,
      }),
    )

    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseclick', {
        detail: 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )

    fireEvent(
      eventSourceElement,
      new MouseEvent('click', {
        detail: 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
  })
}

export function dispatchMouseClickEventAtPoint(
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
  } = {},
): void {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }
  const { buttons, ...mouseUpOptions } = eventOptions ?? {}

  const eventSourceElement = document.elementFromPoint(point.x, point.y)
  if (eventSourceElement == null) {
    throw new Error('No DOM element found at point')
  }

  eventSourceElement.dispatchEvent(
    new MouseEvent('mousedown', {
      detail: 1,
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      buttons: 1,
      ...eventOptions,
    }),
  )
  eventSourceElement.dispatchEvent(
    new MouseEvent('mouseup', {
      detail: 1,
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      buttons: 1,
      ...mouseUpOptions,
    }),
  )
  eventSourceElement.dispatchEvent(
    new MouseEvent('mouseclick', {
      detail: 1,
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      buttons: 1,
      ...eventOptions,
    }),
  )
  eventSourceElement.dispatchEvent(
    new MouseEvent('click', {
      detail: 1,
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      buttons: 1,
      ...eventOptions,
    }),
  )
}

export async function mouseDoubleClickAtPoint(
  eventSourceElement: HTMLElement,
  point: Point,
  options: {
    modifiers?: Modifiers
    eventOptions?: MouseEventInit
    initialClickCount?: number
  } = {},
) {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }
  const { buttons, ...mouseUpOptions } = eventOptions ?? {}
  const initialClickCount = options.initialClickCount ?? 0

  await act(async () => {
    fireEvent(
      eventSourceElement,
      new MouseEvent('mousedown', {
        detail: initialClickCount + 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseup', {
        detail: initialClickCount + 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        ...mouseUpOptions,
      }),
    )
    fireEvent(
      eventSourceElement,
      new MouseEvent('click', {
        detail: initialClickCount + 1,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
    fireEvent(
      eventSourceElement,
      new MouseEvent('mousedown', {
        detail: initialClickCount + 2,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
    fireEvent(
      eventSourceElement,
      new MouseEvent('mouseup', {
        detail: initialClickCount + 2,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        ...mouseUpOptions,
      }),
    )
    fireEvent(
      eventSourceElement,
      new MouseEvent('click', {
        detail: initialClickCount + 2,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
    fireEvent(
      eventSourceElement,
      new MouseEvent('dblclick', {
        detail: initialClickCount + 2,
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        buttons: 1,
        ...eventOptions,
      }),
    )
  })
}

export function keyDown(
  key: string,
  options: {
    modifiers?: Modifiers
    eventOptions?: KeyboardEventInit
  } = {},
) {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  act(() => {
    fireEvent(
      document.body,
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: key,
        keyCode: keycode(key),
        ...eventOptions,
      }),
    )
  })
}

export function keyUp(
  key: string,
  options: {
    modifiers?: Modifiers
    eventOptions?: KeyboardEventInit
  } = {},
) {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  act(() => {
    fireEvent(
      document.body,
      new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: key,
        keyCode: keycode(key),
        ...eventOptions,
      }),
    )
  })
}

export async function pressKey(
  key: string,
  options: {
    modifiers?: Modifiers
    eventOptions?: KeyboardEventInit
    targetElement?: HTMLElement
  } = {},
): Promise<void> {
  const modifiers = options.modifiers ?? emptyModifiers
  const passedEventOptions = options.eventOptions ?? {}
  const eventOptions = {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.cmd,
    altKey: modifiers.alt,
    shiftKey: modifiers.shift,
    ...passedEventOptions,
  }

  const target = options?.targetElement ?? document.body

  await act(async () => {
    fireEvent(
      target,
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: key,
        keyCode: keycode(key),
        ...eventOptions,
      }),
    )

    fireEvent(
      target,
      new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: key,
        keyCode: keycode(key),
        ...eventOptions,
      }),
    )
  })
}

// https://github.com/testing-library/react-testing-library/issues/339
export function makeDragEvent(
  type: 'dragstart' | 'dragenter' | 'dragover' | 'dragleave' | 'dragend' | 'drop',
  target: Element | Node,
  clientCoords: { x: number; y: number },
  fileList?: Array<File>,
): Event {
  const opts = {
    clientX: clientCoords.x,
    clientY: clientCoords.y,
    buttons: 1,
    bubbles: true,
    cancelable: true,
  }

  let createEventForType: (node: Node, options: any) => Event = createEvent.drop
  switch (type) {
    case 'dragend':
      createEventForType = createEvent.dragLeave
      break
    case 'dragenter':
      createEventForType = createEvent.dragEnter
      break
    case 'dragover':
      createEventForType = createEvent.dragOver
      break
    case 'dragleave':
      createEventForType = createEvent.dragLeave
      break
    case 'dragstart':
      createEventForType = createEvent.dragStart
      break
    default:
    case 'drop':
      createEventForType = createEvent.drop
      break
  }

  const fileDropEvent: Event = createEventForType(target, opts)

  if (fileList != null) {
    Object.defineProperty(fileDropEvent, 'dataTransfer', {
      value: {
        getData: () => '',
        items: fileList.map((f) => ({ kind: 'file', getAsFile: () => f })),
        files: {
          item: (itemIndex: number) => fileList[itemIndex],
          length: fileList.length,
        },
        types: ['Files'],
      },
    })
  }

  return fileDropEvent
}

export async function dragElementToPoint(
  eventSourceElement: HTMLElement | null,
  targetElement: HTMLElement,
  startPoint: Point,
  endPoint: Point,
  fileList: Array<File>,
): Promise<void> {
  if (eventSourceElement != null) {
    await act(async () => {
      fireEvent(
        eventSourceElement,
        makeDragEvent('dragstart', eventSourceElement, startPoint, fileList),
      )
    })
  }
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('dragenter', targetElement, { x: 0, y: 0 }, fileList))
  })
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('dragover', targetElement, { x: 0, y: 0 }, fileList))
  })
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('dragover', targetElement, endPoint, fileList))
  })
}

export async function dropElementAtPoint(
  targetElement: HTMLElement,
  endPoint: Point,
  fileList: Array<File>,
): Promise<void> {
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('drop', targetElement, endPoint, fileList))
  })
}

export async function switchDragAndDropElementTargets(
  startingElement: HTMLElement,
  targetElement: HTMLElement,
  startPoint: Point,
  endPoint: Point,
  fileList: Array<File>,
): Promise<void> {
  await act(async () => {
    fireEvent(startingElement, makeDragEvent('dragleave', startingElement, startPoint, fileList))
  })
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('dragenter', targetElement, { x: 0, y: 0 }, fileList))
  })
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('dragover', targetElement, { x: 0, y: 0 }, fileList))
  })
  await act(async () => {
    fireEvent(targetElement, makeDragEvent('dragover', targetElement, endPoint, fileList))
  })
}

export class MockClipboardHandlers {
  mockClipBoard: { data: ClipboardDataPayload | null } = { data: null }
  pasteDone: ReturnType<typeof defer> = defer()
  sandbox: Sinon.SinonSandbox | null = null

  mock(): MockClipboardHandlers {
    beforeEach(() => {
      this.sandbox = Sinon.createSandbox()
      this.pasteDone = defer()

      const parseClipboardDataStub = this.sandbox.stub(Clipboard, 'parseClipboardData')
      parseClipboardDataStub.callsFake(async (c) => {
        if (this.mockClipBoard.data == null) {
          throw new Error('Mock clipboard is empty')
        }
        this.pasteDone.resolve()
        return {
          files: [],
          utopiaData: extractUtopiaDataFromHtml(this.mockClipBoard.data.html),
        }
      })

      const setClipboardDataStub = this.sandbox.stub(Clipboard, 'setClipboardData')
      setClipboardDataStub.callsFake(async (c) => {
        this.mockClipBoard.data = c
      })
    })

    afterEach(() => {
      this.sandbox?.restore()
      this.mockClipBoard.data = null
      this.sandbox = null
    })

    return this
  }

  resetDoneSignal(): void {
    this.pasteDone = defer()
  }
}

// https://github.com/testing-library/react-testing-library/issues/339 as above makeDragEvent,
// though it uses a different property name the issue is still the same
export function firePasteImageEvent(eventSourceElement: HTMLElement, images: Array<File>): void {
  const pasteEvent = createEvent.paste(eventSourceElement)
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      getData: () => '',
      items: images.map((f) => ({ kind: 'file', getAsFile: () => f })),
      files: {
        item: (itemIndex: number) => images[itemIndex],
        length: images.length,
      },
      types: ['Files'],
    },
  })

  act(() => {
    fireEvent(eventSourceElement, pasteEvent)
  })
}

export function firePasteEvent(eventSourceElement: HTMLElement): void {
  const pasteEvent = createEvent.paste(eventSourceElement)
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: {
      getData: () => null,
    },
  })

  act(() => {
    fireEvent(eventSourceElement, pasteEvent)
  })
}
