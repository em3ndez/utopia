import { roundUpToNearestHalf, wrapValue } from './math-utils'

describe('math utils', () => {
  describe('wrapValue', () => {
    it('wraps values inside the given boundaries', async () => {
      expect(wrapValue(0, 0, 5)).toEqual(0)
      expect(wrapValue(3, 0, 5)).toEqual(3)
      expect(wrapValue(5, 0, 5)).toEqual(5)
      expect(wrapValue(6, 0, 5)).toEqual(0)
      expect(wrapValue(8, 0, 5)).toEqual(2)
      expect(wrapValue(14, 0, 5)).toEqual(2)
      expect(wrapValue(-1, 0, 5)).toEqual(5)
      expect(wrapValue(-3, 0, 5)).toEqual(3)
      expect(wrapValue(-14, 0, 5)).toEqual(4)
      expect(wrapValue(14, 10, 15)).toEqual(14)
      expect(wrapValue(18, 10, 15)).toEqual(12)
      expect(wrapValue(9, 10, 15)).toEqual(15)
      expect(wrapValue(7, 10, 15)).toEqual(13)
      expect(wrapValue(-4, -7, -3)).toEqual(-4)
      expect(wrapValue(-11, -7, -3)).toEqual(-6)
      expect(wrapValue(-2, -7, -3)).toEqual(-7)
    })
  })
  describe('roundUpToNearestHalf', () => {
    const testValues: Array<[number, number]> = [
      [-1000, -1000],
      [-1000.1, -1000],
      [-999.9, -999.5],
      [-1, -1],
      [-1.4, -1],
      [-0.9, -0.5],
      [-0.1, -0],
      [0.1, 0.5],
      [0.4, 0.5],
      [0.5, 0.5],
      [0.999, 1],
      [9.1, 9.5],
      [9.9, 10],
    ]
    for (const [inputValue, expectedResult] of testValues) {
      it(`With ${inputValue} as an input, should return ${expectedResult}`, () => {
        expect(roundUpToNearestHalf(inputValue)).toEqual(expectedResult)
      })
    }
  })
})
