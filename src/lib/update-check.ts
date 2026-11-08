const RELEASES_URL =
  "https://api.github.com/repos/Selfinflicted79/BPH-Stream-Controller/releases/latest";

function parseVersion(raw: string) {
  return raw
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10) || 0);
}

function isNewer(remote: string, local: string) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

export async function checkControllerUpdate(localVersion: string) {
  const response = await fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (response.status === 404) {
    return { available: false as const, tag: "", url: "", page: "" };
  }
  if (!response.ok) throw new Error("Could not reach GitHub Releases.");
  const data = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    assets?: Array<{ name: string; browser_download_url: string }>;
  };
  const tag = data.tag_name ?? "";
  if (!tag || !isNewer(tag, localVersion)) {
    return { available: false as const, tag, url: data.html_url ?? "", page: data.html_url ?? "" };
  }
  const portable =
    data.assets?.find((asset) => /portable\.exe$/i.test(asset.name)) ?? data.assets?.[0];
  return {
    available: true as const,
    tag,
    url: portable?.browser_download_url ?? data.html_url ?? "",
    page: data.html_url ?? "",
  };
}
