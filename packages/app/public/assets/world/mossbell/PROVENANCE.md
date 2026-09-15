# Production record

Pack: Mossbell Orchard, v1.0.0. Prepared 11 September 2026.

1. A new 24-object farming sprite sheet was generated for this project. Broad genre reference: cute pastel farming RPG art. No downloaded sprites, character designs, logos or branding from the reference pack were included.
2. Individual objects were separated using inspected, non-uniform crop boundaries. The generated sheet did not follow an exact 256 px cell grid, so blind equal-cell slicing was not used.
3. Alpha was cleaned locally: edge noise was removed and final game sprites use only alpha 0 or 255. Small disconnected features were preserved except detached fragments below four source pixels. Faces and silhouettes were visually reviewed.
4. World PNGs were nearest-neighbour normalized to documented native canvas sizes and quantized to a common 96-color world-art palette.
5. Complementary crops and terrain were drawn as original pixel rasters with AI-assisted deterministic code. These are not copied from the concept/reference image. Their palette is included.
6. Sample scenes and all supplied storefront images were assembled from shipped normalized PNGs. No separate generated concept poster is used as a product screenshot.
7. Technical checks are recorded in QA_REPORT.json. Visual review and browser checks supplement, but do not replace, testing in a buyer's chosen engine.

Platform reference pages consulted:
- https://itch.io/docs/creators/quality-guidelines
- https://itch.io/docs/creators/getting-started
- https://cupnooble.itch.io/sprout-lands-asset-pack

The reference pack's license does not permit standalone redistribution; none of its asset files are part of this release. Its name is mentioned only in documentation to distinguish this independent pack from the reference, not as a product tag or endorsement.
