import { fmtNum } from "../../lib/format";
import type { ShmView } from "../api";
import { EnvelopeChart, Note } from "../charts";
import { Tiles } from "../parts";
import w from "../workbench.module.css";

/** Summary of one stress recording. Descriptive only. */
export function ShmPreview({ view }: { view: ShmView }) {
  return (
    <div className={w.stack}>
      <Note>This is a preview of the uploaded stress recording, not a prediction. The estimated fatigue damage appears here once the model is added.</Note>
      <Tiles
        items={[
          { label: "Samples", value: fmtNum(view.samples) },
          { label: "Lowest", value: fmtNum(view.minimum, 2) },
          { label: "Highest", value: fmtNum(view.maximum, 2) },
          { label: "Mean", value: fmtNum(view.mean, 2), note: `standard deviation ${fmtNum(view.std, 2)}` },
        ]}
      />
      <EnvelopeChart
        low={view.envelopeMin}
        high={view.envelopeMax}
        height={200}
        xLabel="position in the recording"
        yLabel="Dynamic stress, as recorded"
      />
    </div>
  );
}
