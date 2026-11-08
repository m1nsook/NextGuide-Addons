/** NextGuide v2 developer example; Account Mode OS-isolated runtime only. */
export async function activate({ request }) {
  const info = await request("extension.info")
  const previous = await request("storage.get", { key: "activations" })
  const count = Number(previous || 0) + 1
  await request("storage.set", { key: "activations", value: count })
  await request("contribution.publish", {
    kind: "admin.page",
    descriptor: {
      id: "activation-counter",
      title: "Activation counter",
      view: {
        type: "card",
        children: [
          { type: "heading", level: 2, text: "Add-on status" },
          { type: "paragraph", text: "Extension " + info.id + " has activated " + count + " times." },
        ],
      },
    },
  })
  // A future production host supplies a bounded lifetime and cleanup signal.
  return () => {}
}
