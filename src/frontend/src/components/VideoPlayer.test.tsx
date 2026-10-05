import { VideoPlayer } from "@/components/VideoPlayer";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Characterization baseline for the single real HTML5 video surface.
 *
 * The upcoming work adds a test/dev sign-in path and wires uploaded footage
 * into the video surfaces. These tests freeze the player behavior those
 * surfaces depend on and must not regress:
 *
 *  - a real <video> with native controls plays the given source;
 *  - an absent source shows an honest empty state, never a fake player;
 *  - a source that fails to load shows an honest error state;
 *  - the loading overlay clears once the media is ready.
 *
 * They deliberately do NOT assert anything about the sign-in path, which is
 * the intentional addition.
 */

describe("VideoPlayer", () => {
  it("plays the given source through a real <video> with native controls", () => {
    render(
      <VideoPlayer
        src="https://storage.example/run-7.mp4"
        title="Run #7 produced video"
        aspectRatio="9:16"
      />,
    );

    const video = screen.getByTestId("video_player.video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "https://storage.example/run-7.mp4");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("aria-label", "Run #7 produced video");
    expect(
      screen.queryByTestId("video_player.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("shows an honest empty state instead of a player when there is no source", () => {
    render(<VideoPlayer src={null} title="Run #7 produced video" />);

    expect(screen.getByTestId("video_player.empty_state")).toBeInTheDocument();
    expect(screen.queryByTestId("video_player.video")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("video_player.error_state"),
    ).not.toBeInTheDocument();
  });

  it("uses a custom empty message when one is provided", () => {
    render(
      <VideoPlayer
        src={null}
        title="TikTok cut"
        emptyMessage="No playable video was produced for this cut."
      />,
    );

    expect(screen.getByTestId("video_player.empty_state")).toHaveTextContent(
      "No playable video was produced for this cut.",
    );
  });

  it("shows an honest error state when the media fails to load", () => {
    render(
      <VideoPlayer
        src="https://storage.example/missing.mp4"
        title="Run #7 produced video"
      />,
    );

    // The player starts in its loading state, then the media element reports a
    // load failure.
    expect(
      screen.getByTestId("video_player.loading_state"),
    ).toBeInTheDocument();

    fireEvent.error(screen.getByTestId("video_player.video"));

    expect(screen.getByTestId("video_player.error_state")).toHaveTextContent(
      /could not be loaded/i,
    );
    expect(
      screen.queryByTestId("video_player.loading_state"),
    ).not.toBeInTheDocument();
    // The real <video> element remains mounted; the error is an overlay, not a
    // replacement that pretends the file never existed.
    expect(screen.getByTestId("video_player.video")).toBeInTheDocument();
  });

  it("clears the loading overlay once the media is ready", () => {
    render(
      <VideoPlayer
        src="https://storage.example/run-7.mp4"
        title="Run #7 produced video"
      />,
    );

    expect(
      screen.getByTestId("video_player.loading_state"),
    ).toBeInTheDocument();

    fireEvent.loadedData(screen.getByTestId("video_player.video"));

    expect(
      screen.queryByTestId("video_player.loading_state"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("video_player.error_state"),
    ).not.toBeInTheDocument();
  });

  it("resets to the loading state when the source changes", () => {
    const { rerender } = render(
      <VideoPlayer
        src="https://storage.example/run-7.mp4"
        title="Run #7 produced video"
      />,
    );

    fireEvent.loadedData(screen.getByTestId("video_player.video"));
    expect(
      screen.queryByTestId("video_player.loading_state"),
    ).not.toBeInTheDocument();

    rerender(
      <VideoPlayer
        src="https://storage.example/run-8.mp4"
        title="Run #8 produced video"
      />,
    );

    // A new cut must not inherit the previous cut's ready status.
    expect(
      screen.getByTestId("video_player.loading_state"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("video_player.video")).toHaveAttribute(
      "src",
      "https://storage.example/run-8.mp4",
    );
  });
});
