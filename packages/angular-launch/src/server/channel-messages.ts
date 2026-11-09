import { inputIssues, type InputIssue } from "../input-issues.js";
import type { Schema } from "./definitions.js";

/**
 * Where a channel's handler reads its caller's messages from. Internal.
 *
 * @remarks
 * The socket side of a channel creates it before the upgrade is accepted, so the handler can
 * hold its `messages` from the start; messages arrive once the socket is accepted.
 */
export interface ChannelInbox {
  /**
   * Takes the next unread message as received, before validation.
   *
   * @returns The message, or `done` once the caller closed the channel. Rejects with a
   * {@link MessageRefused} after the caller broke the protocol.
   */
  next(): Promise<IteratorResult<unknown, undefined>>;
  /**
   * Ends the call with `INVALID_INPUT` and `issues`, for a message that failed validation.
   *
   * @param issues - The message schema's issues.
   */
  refuse(issues: readonly InputIssue[]): void;
}

/**
 * Why a channel's messages ended: the caller sent a message that failed validation, or broke
 * the protocol. Internal.
 *
 * @remarks
 * `dispatch` answers it with `INVALID_INPUT` and its issues instead of logging it as an
 * unexpected failure.
 */
export class MessageRefused extends Error {
  /**
   * Creates the refusal.
   *
   * @param issues - The message schema's issues; empty for a protocol violation.
   */
  constructor(readonly issues: readonly InputIssue[]) {
    super("Launch channel refused a message");
    this.name = "MessageRefused";
  }
}

/**
 * The `messages` a channel's handler receives: the inbox's messages, validated with `schema`
 * as they're read, in arrival order.
 *
 * @remarks
 * Internal. One consumer only: a second iterator throws a `TypeError`. A message that fails
 * validation refuses the call through the inbox and throws a {@link MessageRefused}; after
 * that, or after `return()`, iteration is done.
 *
 * @param inbox - Where the messages come from.
 * @param schema - The channel's message schema.
 */
export function channelMessages(inbox: ChannelInbox, schema: Schema): AsyncIterable<unknown> {
  let taken = false;
  let finished = false;
  // Reads run one after another, so an asynchronous schema can't reorder messages.
  let previous: Promise<unknown> = Promise.resolve();

  async function read(): Promise<IteratorResult<unknown, undefined>> {
    if (finished) {
      return { done: true, value: undefined };
    }

    let received: IteratorResult<unknown, undefined>;

    try {
      received = await inbox.next();
    } catch (error) {
      finished = true;

      throw error;
    }

    if (received.done) {
      finished = true;

      return received;
    }

    const parsed = await schema["~standard"].validate(received.value);

    if (parsed.issues) {
      const issues = inputIssues(parsed.issues);

      finished = true;
      inbox.refuse(issues);

      throw new MessageRefused(issues);
    }

    return { done: false, value: parsed.value };
  }

  return {
    [Symbol.asyncIterator]() {
      if (taken) {
        throw new TypeError("A channel's messages have one consumer: iterate them once");
      }

      taken = true;

      return {
        next() {
          const step = previous.then(read);

          previous = step.catch(() => undefined);

          return step;
        },
        async return() {
          finished = true;

          return { done: true, value: undefined };
        },
      };
    },
  };
}
