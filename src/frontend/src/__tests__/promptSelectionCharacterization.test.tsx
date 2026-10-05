import {
  type MediaArtifact,
  MediaArtifactStatus,
  type VideoGeneration,
  VideoGenerationStatus,
  type VideoModel,
  VideoOutputStatus,
  type VideoPromptOption,
} from "@/backend";
import { GenerateVideosControl } from "@/components/GenerateVideosControl";
import { GeneratedVideos } from "@/components/GeneratedVideos";
import { VideoDetail } from "@/components/VideoDetail";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import { createMockActor, renderWithProviders } from "@/test/helpers";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization baseline for the surfaces the prompt-selection work touches,
 * ahead of that change.
 *
 * The request intentionally changes how a generation is started: the operator
 * will pick which prompt/cut to generate from, only that single prompt will be
 * sent, and the chosen prompt will be shown alongside the result. These tests
 * deliberately do NOT pin the current single-prompt start payload or any
 * prompt-picker UI. They pin the adjacent behavior that must keep working once
 * the picker is introduced:
 *
 *   - the Generate Videos control still offers its model picker, still disables
 *     its action while a generation is in flight, and still renders the honest
 *     no-result and failed states with a usable retry action;
 *   - the Generated Videos grid still renders a playable cut per format and
 *     still lets the operator cancel a delete without touching the backend;
 *   - the detail view still plays the cut's real media and still lets the
 *     operator cancel a delete without removing the video;
 *   - the page still shows an honest not-found state for a missing run rather
 *     than a blank screen.
 *
 * The backend actor is a local typed mock, so this proves the component and
 * consumer contract, not the real canister. The PocketIC lane covers the real
 * video methods.
 */

const infra = vi.hoisted(() => ({
  isAuthenticated: true,
  isInitializing: false,
  actor: null as unknown,
}));

const router = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));

vi.mock("@caffeineai/core-infrastructure", () => ({
  useInternetIdentity: () => ({
    isAuthenticated: infra.isAuthenticated,
    isInitializing: infra.isInitializing,
    identity: undefined,
    clear: vi.fn(),
    login: vi.fn(),
  }),
  useActor: () => ({ actor: infra.actor, isFetching: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => router.navigate,
  useSearch: () => router.search,
}));

const MODELS: VideoModel[] = [
  {
    id: "kwaivgi/kling-v3-video",
    name: "Kling 3.0",
    provider: "Replicate",
    premium: false,
    default: true,
  },
  {
    id: "google/veo-3.1",
    name: "Veo 3.1",
    provider: "Replicate",
    premium: true,
    default: false,
  },
];

const PROMPTS: VideoPromptOption[] = [
  { index: 0n, agent: "writer", content: "Writer draft text." },
  { index: 1n, agent: "visual", content: "Visual prompt text." },
];

const readyArtifact: MediaArtifact = {
  status: MediaArtifactStatus.ready,
  createdAt: 1_700_000_200_000_000_000n,
  mimeType: "video/mp4",
  durationSeconds: 42,
  storageUrl: "https://storage.example/run-7.mp4",
  aspectRatio: "9:16",
};

function generationRecord(
  overrides: Partial<VideoGeneration> = {},
): VideoGeneration {
  return {
    runId: 7n,
    modelId: "kwaivgi/kling-v3-video",
    status: VideoGenerationStatus.generating,
    startedAt: BigInt(Date.now() - 5_000) * 1_000_000n,
    finishedAt: undefined,
    promptIndex: 0n,
    prompt: "Visual prompt text.",
    predictionId: undefined,
    error: undefined,
    ...overrides,
  };
}

describe("GenerateVideosControl adjacent behavior", () => {
  it("keeps the model picker and its action usable after a no-result generation", async () => {
    const user = userEvent.setup();
    const actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({ status: VideoGenerationStatus.no_result }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
      rerunVideoGeneration: vi.fn(async () => generationRecord()),
    });
    infra.actor = actor;

    renderWithProviders(
      <GenerateVideosControl runId={7n} accepted mode="rerun" />,
    );

    // The honest no-result explanation is shown...
    const noResult = await screen.findByTestId(
      "videos.generate.no_result_state",
    );
    expect(noResult).toHaveTextContent(/without producing a playable video/i);

    // ...and the control is not stuck: the model picker and the retry action
    // remain available so the operator can try again.
    expect(
      screen.getByTestId("videos.generate.model_select"),
    ).not.toBeDisabled();
    const button = screen.getByTestId("videos.generate.primary_button");
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);
    await waitFor(() => {
      expect(actor.rerunVideoGeneration).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the retry action available after a failed generation", async () => {
    const actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () =>
        generationRecord({
          status: VideoGenerationStatus.failed,
          error: "Replicate request failed",
        }),
      ),
      listRunPrompts: vi.fn(async () => PROMPTS),
    });
    infra.actor = actor;

    renderWithProviders(
      <GenerateVideosControl runId={7n} accepted mode="rerun" />,
    );

    expect(
      await screen.findByTestId("videos.generate.error_state"),
    ).toHaveTextContent("Replicate request failed");
    // A failure is terminal for the attempt, not for the control: the operator
    // can retry rather than being left with a permanently disabled action.
    await waitFor(() => {
      expect(
        screen.getByTestId("videos.generate.primary_button"),
      ).not.toBeDisabled();
    });
  });

  it("disables the model picker while a generation is in flight", async () => {
    infra.actor = createMockActor({
      listVideoModels: vi.fn(async () => MODELS),
      getReplicateTokenStatus: vi.fn(async () => ({ configured: true })),
      getVideoGeneration: vi.fn(async () => generationRecord()),
    });

    renderWithProviders(<GenerateVideosControl runId={7n} accepted />);

    await screen.findByTestId("videos.generate.loading_state");
    expect(screen.getByTestId("videos.generate.model_select")).toBeDisabled();
  });
});

describe("GeneratedVideos delete cancel", () => {
  it("cancels a delete without removing the video or calling the backend", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    render(
      <GeneratedVideos
        videos={[
          {
            id: "TikTok-0",
            title: "TikTok cut",
            platform: "TikTok",
            aspectRatio: "9:16",
            durationSeconds: 42,
            mediaUrl: readyArtifact.storageUrl,
            videoStatus: VideoOutputStatus.ready,
            script: "Short-form adaptation.",
            continuityNotes: "Continuity notes.",
          },
        ]}
        onSelect={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByTestId("videos.delete_button.1"));
    await user.click(await screen.findByTestId("videos.delete_cancel_button"));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId("videos.item.1")).toBeInTheDocument();
    expect(screen.queryByTestId("videos.delete_confirm_button")).toBeNull();
  });
});

describe("VideoDetail delete cancel", () => {
  it("cancels a delete without removing the video or calling onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    render(
      <VideoDetail
        video={{
          id: "TikTok-0",
          title: "TikTok cut",
          platform: "TikTok",
          aspectRatio: "9:16",
          durationSeconds: 42,
          mediaUrl: readyArtifact.storageUrl,
          videoStatus: VideoOutputStatus.ready,
          script: "Short-form adaptation.",
          continuityNotes: "Continuity notes.",
        }}
        onBack={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByTestId("videos.detail.delete_button"));
    await user.click(
      await screen.findByTestId("videos.detail.delete_cancel_button"),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId("video_player.video")).toHaveAttribute(
      "src",
      readyArtifact.storageUrl,
    );
  });
});

describe("GeneratedVideosPage not-found state", () => {
  beforeEach(() => {
    infra.isAuthenticated = true;
    infra.isInitializing = false;
    router.search = { runId: "7" };
    router.navigate.mockReset();
  });

  it("shows an honest not-found state instead of a blank screen for a missing run", async () => {
    infra.actor = createMockActor({
      getRun: vi.fn(async () => null),
      listRevisions: vi.fn(async () => []),
      getMediaArtifact: vi.fn(async () => null),
    });

    renderWithProviders(<GeneratedVideosPage />);

    expect(
      await screen.findByTestId("videos.not_found_state"),
    ).toHaveTextContent(/run not found/i);
    expect(screen.getByTestId("videos.start_run_button")).toBeInTheDocument();
  });
});
