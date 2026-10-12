import { COORDINATE_EXAMPLES, isInUganda, parseCoordinates } from "@/lib/ops/coordinates";

function AcceptedFormats() {
  return (
    <ul aria-label="Accepted coordinate formats" className="mt-1.5 space-y-0.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      {COORDINATE_EXAMPLES.map(({ format, example }) => (
        <li key={format}>
          <span className="font-medium text-foreground">{format}:</span>{" "}
          <code className="font-mono">{example}</code>
        </li>
      ))}
    </ul>
  );
}

/** Live feedback under the Coordinates box: what was read, or why not plus
 * the formats that do work. Latitude comes first unless N/S/E/W say otherwise. */
export function CoordinatesHint({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <div id="gps-coordinates-hint">
        <p className="text-xs text-muted-foreground">Latitude first, then longitude. Accepted formats:</p>
        <AcceptedFormats />
      </div>
    );
  }
  const parsed = parseCoordinates(text);
  if (!parsed) {
    return (
      <div id="gps-coordinates-hint" role="alert">
        <p className="text-xs text-destructive">
          &ldquo;{text.trim()}&rdquo; isn&apos;t a supported coordinates format, so it hasn&apos;t been saved. Use one of these:
        </p>
        <AcceptedFormats />
      </div>
    );
  }
  if (!isInUganda(parsed)) {
    return (
      <p id="gps-coordinates-hint" role="alert" className="text-xs text-destructive">
        That point ({parsed.lat}, {parsed.lon}) is outside Uganda, so it hasn&apos;t been saved. Check the latitude and longitude aren&apos;t swapped.
      </p>
    );
  }
  return (
    <p id="gps-coordinates-hint" className="text-xs text-success">
      Using {parsed.lat.toFixed(6)}, {parsed.lon.toFixed(6)}.
    </p>
  );
}
