/** An adapter usage error, such as reading a root's state before Angular set its inputs. */
export class UiSdkError extends Error {
  override readonly name = "UiSdkError";
}
