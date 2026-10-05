import { screen } from "@testing-library/react";

/**
 * Diagnostic journey harness (test-only).
 *
 * The problem this solves: a journey test that wraps its whole body in one
 * `try/catch` and reports "could not be completed" tells a reader nothing about
 * *where* it stopped, *what* failed, or *what the app showed* at that point.
 * This harness runs a journey as an ordered list of named steps and, on the
 * first failure, throws a `JourneyStepError` that names the exact step, carries
 * the underlying error, and includes the app response observed at that moment.
 *
 * It also refuses to pass silently. A step that is skipped, or a journey that
 * runs zero steps, is an explicit failure — never a green run that exercised
 * nothing.
 */

/** A single named step in a journey. Returning normally means it passed. */
export interface JourneyStep {
  /** Human-readable name, e.g. "activate test-only sign-in". */
  name: string;
  /** The step body. Throw to fail the step. */
  run: () => void | Promise<void>;
}

/**
 * Thrown when a journey step fails. Carries the exact step reached, the
 * underlying error, and the app response observed at that point, so the test
 * output names all three instead of a generic "could not be completed".
 */
export class JourneyStepError extends Error {
  readonly stepName: string;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly cause: unknown;
  readonly appResponse: string;

  constructor(options: {
    stepName: string;
    stepIndex: number;
    stepCount: number;
    cause: unknown;
    appResponse: string;
  }) {
    const causeMessage =
      options.cause instanceof Error
        ? options.cause.message
        : String(options.cause);
    super(
      [
        `Journey stopped at step ${options.stepIndex + 1}/${options.stepCount}: "${options.stepName}"`,
        `Error: ${causeMessage}`,
        `App response observed at that point: ${options.appResponse}`,
      ].join("\n"),
    );
    this.name = "JourneyStepError";
    this.stepName = options.stepName;
    this.stepIndex = options.stepIndex;
    this.stepCount = options.stepCount;
    this.cause = options.cause;
    this.appResponse = options.appResponse;
  }
}

/**
 * Captures what the app is currently showing, for the failure report. Prefers
 * the rendered body text (trimmed and collapsed) and falls back to a marker
 * when nothing is rendered, so the report never claims an empty response when
 * the DOM is simply absent.
 */
export function captureAppResponse(): string {
  try {
    const body = document.body;
    if (!body) return "<no document body>";
    const text = (body.textContent ?? "").replace(/\s+/gu, " ").trim();
    if (text.length === 0) {
      const testIds = Array.from(body.querySelectorAll("[data-ocid]"))
        .map((element) => element.getAttribute("data-ocid"))
        .filter((value): value is string => value !== null);
      return testIds.length > 0
        ? `<no visible text; data-ocid present: ${testIds.join(", ")}>`
        : "<no visible text and no data-ocid elements>";
    }
    return text.length > 600 ? `${text.slice(0, 600)}…` : text;
  } catch (error) {
    return `<unable to capture app response: ${
      error instanceof Error ? error.message : String(error)
    }>`;
  }
}

/**
 * Runs an ordered journey. Every step is awaited in sequence; the first failure
 * throws a `JourneyStepError` naming the step, the error, and the observed app
 * response. A journey with no steps fails explicitly rather than passing.
 */
export async function runJourney(steps: readonly JourneyStep[]): Promise<void> {
  if (steps.length === 0) {
    throw new Error(
      "Journey harness error: no steps were provided, so nothing was exercised. " +
        "A journey must not report success without running at least one step.",
    );
  }

  for (const [index, step] of steps.entries()) {
    try {
      await step.run();
    } catch (cause) {
      throw new JourneyStepError({
        stepName: step.name,
        stepIndex: index,
        stepCount: steps.length,
        cause,
        appResponse: captureAppResponse(),
      });
    }
  }
}

/**
 * Asserts that a step's observable condition holds, with a message that names
 * the step. Use inside a step body so a failed expectation is attributed to the
 * step rather than to an anonymous assertion.
 */
export function expectStep(
  stepName: string,
  condition: boolean,
  detail: string,
): void {
  if (!condition) {
    throw new Error(`Step "${stepName}" failed: ${detail}`);
  }
}

/**
 * Waits for an element by test id and returns it, failing the step with a
 * readable message (including the app response) when it never appears. This is
 * the diagnostic replacement for a bare `findByTestId` whose timeout message
 * does not say which step was waiting.
 */
export async function findStepElement(
  stepName: string,
  testId: string,
  timeout = 5_000,
): Promise<HTMLElement> {
  try {
    return await screen.findByTestId(testId, {}, { timeout });
  } catch (cause) {
    throw new Error(
      `Step "${stepName}" could not find element [data-ocid="${testId}"] within ${timeout}ms. ` +
        `App response: ${captureAppResponse()}`,
      { cause },
    );
  }
}
