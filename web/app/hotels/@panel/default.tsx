// Renders nothing when the detail slide-over isn't active (initial load /
// hard refresh of /hotels, or navigation away). Without this, a refresh on
// /hotels/[id] would 404 the panel slot.
export default function Default() {
  return null;
}
