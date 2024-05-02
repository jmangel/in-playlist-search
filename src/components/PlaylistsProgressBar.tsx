import { useMemo } from 'react';
import { ProgressBar } from 'react-bootstrap';

const APPROXIMATE_PIXELS_PER_LABEL_CHARACTER = 6;
const createProgressLabel = (
  numFullyLoaded: number,
  numLoaded: number,
  numTotal: number
) => {
  let numeratorString = `${numLoaded}`;
  const denominatorString = `${numTotal}`;

  let numPartiallyLoaded = numLoaded - numFullyLoaded;
  if (numPartiallyLoaded > 0)
    numeratorString += ` (${numPartiallyLoaded} partial)`;

  return `${numeratorString} / ${denominatorString}`;
};

type PlaylistsProgressBarProps = {
  loading: boolean;
  numFullyLoaded: number;
  numLoaded: number;
  numTotal: number;
};
const PlaylistsProgressBar = (props: PlaylistsProgressBarProps) => {
  const { loading, numFullyLoaded, numLoaded, numTotal } = props;

  const progressLabelMinWidth = useMemo(() => {
    const maxPossibleCharacters = createProgressLabel(
      numTotal - 1,
      numTotal,
      numTotal
    ).length;
    return maxPossibleCharacters * APPROXIMATE_PIXELS_PER_LABEL_CHARACTER;
  }, [numTotal]);

  return (
    <ProgressBar>
      <ProgressBar
        animated={loading}
        now={numFullyLoaded}
        max={numTotal}
        label={createProgressLabel(numFullyLoaded, numLoaded, numTotal)}
        variant="success"
        style={{ minWidth: progressLabelMinWidth }}
        // style={{ backgroundColor: SPOTIFY_GREEN }}
      />
    </ProgressBar>
  );
};

export default PlaylistsProgressBar;
