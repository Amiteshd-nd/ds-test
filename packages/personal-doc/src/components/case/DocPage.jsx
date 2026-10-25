import useProjectAnalytics from '../../hooks/useProjectAnalytics';

/*
 * A project whose write-up is a finished design document rather than a case
 * study built from the primitives.
 *
 * The documents are self-contained pages with their own sticky navigation,
 * keyboard shortcuts and themes, so they are shown whole and fill the viewport.
 * The way back lives in each document's own top bar (a link with
 * target="_top" to /works), not in a second bar stacked above it.
 */

export default function DocPage({ project, src, title }) {
  useProjectAnalytics(project);

  return (
    <iframe
      src={src}
      title={title}
      className="block w-full border-0"
      style={{ height: '100dvh' }}
    />
  );
}
