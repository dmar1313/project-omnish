import { VideoOutputStatus } from "@/backend";
import type { VideoOutput } from "@/components/GeneratedVideos";
import { VideoDetail } from "@/components/VideoDetail";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Video detail contract: the detail view plays the cut's real media file
 * through a native HTML5 <video> element with standard controls. When the run
 * produced no playable media it shows an honest empty state instead of a
 * placeholder pretending to be a video. No backend is involved.
 */

const playableVideo: VideoOutput = {
  id: "TikTok-0",
  title: "TikTok cut",
  platform: "TikTok",
  aspectRatio: "9:16",
  durationSeconds: 42,
  mediaUrl: "https://storage.example/run-7.mp4",
  videoStatus: VideoOutputStatus.ready,
  script: "Short-form adaptation.",
  continuityNotes: "Continuity notes.",
};

describe("VideoDetail", () => {
  it("plays the cut's real media file through a native <video> with controls", () => {
    render(<VideoDetail video={playableVideo} onBack={vi.fn()} />);

    const video = screen.getByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", playableVideo.mediaUrl);
    expect(video).toHaveAttribute("controls");
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("shows an honest empty state instead of a fake player when there is no media", () => {
    render(
      <VideoDetail
        video={{ ...playableVideo, mediaUrl: null }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("video_player.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
    // The script and notes remain available even without a playable file.
    expect(
      screen.getByTestId("videos.detail.script.section"),
    ).toHaveTextContent("Short-form adaptation.");
  });

  it("returns to the grid when the back control is used", async () => {
    const onBack = vi.fn();
    render(<VideoDetail video={playableVideo} onBack={onBack} />);

    screen.getByTestId("videos.detail.back_button").click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
