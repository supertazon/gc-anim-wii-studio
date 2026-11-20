/* mp4.js - minimal MP4 writer for one video track (H.264 "avc1" or VP9 "vp09").
 * All samples go in one chunk; moov is written before mdat so the file starts playing at once.
 * Input: chunks from WebCodecs VideoEncoder (EncodedVideoChunk) in decode order. */
var GCA = GCA || {};
(function (G) {
  const te = new TextEncoder();
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >>> 8) & 255, n & 255]; }
  function cat(parts) {
    let len = 0; for (const p of parts) len += p.length;
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function box(type, ...parts) {
    const body = cat(parts.map(p => (p instanceof Uint8Array ? p : new Uint8Array(p))));
    return cat([new Uint8Array(u32(body.length + 8)), te.encode(type), body]);
  }
  const full = (type, ver, flags, ...parts) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
  const MATRIX = [].concat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));

  /* codec: "avc" (description = avcC from the encoder) or "vp9" */
  function createMuxer({ codec, width, height, fps }) {
    const samples = []; let description = null;
    function add(chunk, meta) {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      samples.push({ data, key: chunk.type === "key" });
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !description)
        description = new Uint8Array(meta.decoderConfig.description instanceof ArrayBuffer ? meta.decoderConfig.description : meta.decoderConfig.description.buffer);
    }
    function sampleEntry() {
      const visual = [].concat([0, 0, 0, 0, 0, 0], u16(1), new Array(16).fill(0), u16(width), u16(height),
        u32(0x480000), u32(0x480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff));
      if (codec === "avc") {
        if (!description) throw new Error("the H.264 encoder gave no avcC");
        return box("avc1", visual, box("avcC", description));
      }
      /* VP9 profile 0, level 3.1, 8-bit 4:2:0, BT.709, limited range */
      return box("vp09", visual, full("vpcC", 1, 0, [0, 31, 0x82, 1, 1, 1], u16(0)));
    }
    function finish() {
      const n = samples.length, ms = Math.round(n * 1000 / fps);
      const keys = []; samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
      const build = mdatOffset => {
        const stbl = box("stbl",
          full("stsd", 0, 0, u32(1), sampleEntry()),
          full("stts", 0, 0, u32(1), u32(n), u32(1)),
          full("stss", 0, 0, u32(keys.length), [].concat(...keys.map(u32))),
          full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
          full("stsz", 0, 0, u32(0), u32(n), [].concat(...samples.map(s => u32(s.data.length)))),
          full("stco", 0, 0, u32(1), u32(mdatOffset)));
        const minf = box("minf", full("vmhd", 0, 1, [0, 0, 0, 0, 0, 0, 0, 0]),
          box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))), stbl);
        const mdia = box("mdia",
          full("mdhd", 0, 0, u32(0), u32(0), u32(fps), u32(n), u16(0x55c4), u16(0)),
          full("hdlr", 0, 0, u32(0), te.encode("vide"), new Array(12).fill(0), te.encode("VideoHandler\0")),
          minf);
        const tkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(ms), new Array(8).fill(0),
          u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16));
        const mvhd = full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(ms), u32(0x10000), u16(0x100),
          new Array(10).fill(0), MATRIX, new Array(24).fill(0), u32(2));
        return box("moov", mvhd, box("trak", tkhd, mdia));
      };
      const ftyp = box("ftyp", te.encode("isom"), u32(512), te.encode("isom"), te.encode("iso2"),
        te.encode(codec === "avc" ? "avc1" : "vp09"), te.encode("mp41"));
      const moovLen = build(0).length;
      const moov = build(ftyp.length + moovLen + 8);
      let size = 0; for (const s of samples) size += s.data.length;
      return new Blob([ftyp, moov, new Uint8Array(u32(size + 8)), te.encode("mdat"), ...samples.map(s => s.data)], { type: "video/mp4" });
    }
    return { add, finish, get count() { return samples.length; } };
  }
  G.mp4 = { createMuxer };
})(GCA);
