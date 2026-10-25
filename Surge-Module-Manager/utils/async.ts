/**
 * Bound an async operation so an iCloud/File Provider or network call cannot
 * leave an Intent running forever in the background.
 */
export type TimeoutOperation<T> = Promise<T> | (() => Promise<T> | T)

/**
 * Start the timer before invoking a lazy operation. Passing a Promise that
 * was already created is still supported, but FileManager/iCloud callers
 * should pass a function so a slow provider call is not started before the
 * timeout guard exists.
 */
export function withTimeout<T>(operation: TimeoutOperation<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: any
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    let started: Promise<T>
    try {
      const value = typeof operation === "function" ? operation() : operation
      started = Promise.resolve(value)
    } catch (error) {
      clearTimeout(timer)
      reject(error)
      return
    }
    started.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
