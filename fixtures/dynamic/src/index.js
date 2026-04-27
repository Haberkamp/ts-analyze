export async function loadFeature(name) {
  const literal = await import("./literal-feature.js");
  const dynamic = await import(`./${name}.js`);

  return { literal, dynamic };
}
