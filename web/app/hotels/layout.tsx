// Wraps every /hotels route. The `panel` parallel slot carries the detail
// slide-over (intercepting route) so it overlays the explorer without the list
// unmounting. Kept minimal — each child page owns its own height/scroll: the
// explorer fills the viewport, the full detail page scrolls as a document.
export default function HotelsLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  return (
    <>
      {children}
      {panel}
    </>
  );
}
