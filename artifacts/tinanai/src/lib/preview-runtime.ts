import { resolveLocalProjectPath } from "./project-preview";

export interface PreviewRuntimeFile {
  path: string;
  content: string;
  mediaType?: string;
}

export type PreviewStorageOperation =
  | { op: "set"; key: string; value: string }
  | { op: "remove"; key: string }
  | { op: "clear" };

export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PreviewDownload {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

const ASSET_MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const ALLOWED_DOWNLOAD_TYPES = new Set([
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/csv",
  "text/html",
  "text/plain",
]);

export const PREVIEW_STORAGE_BYTE_LIMIT = 500_000;
export const PREVIEW_DOWNLOAD_BYTE_LIMIT = 2_000_000;

export function previewMimeType(path: string): string {
  const extension = `.${path.split(".").pop()?.toLowerCase() ?? ""}`;
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".css") return "text/css";
  if (extension === ".js" || extension === ".mjs") return "text/javascript";
  return ASSET_MIME_TYPES[extension] ?? "text/plain";
}

export function isPreviewAssetPath(path: string): boolean {
  return Object.hasOwn(ASSET_MIME_TYPES, `.${path.split(".").pop()?.toLowerCase() ?? ""}`);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeDataUri(value: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,([a-z0-9+/]+=*)$/i.exec(value);
  if (!match) return null;
  try {
    const binary = atob(match[2] ?? "");
    return { mimeType: match[1] ?? "application/octet-stream", bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
  } catch {
    return null;
  }
}

export function previewAssetDataUri(file: PreviewRuntimeFile): string | null {
  if (!isPreviewAssetPath(file.path)) return null;
  const expectedType = ASSET_MIME_TYPES[`.${file.path.split(".").pop()?.toLowerCase() ?? ""}`];
  if (!expectedType) return null;

  if (file.content.startsWith("data:")) {
    const decoded = decodeDataUri(file.content);
    if (!decoded || decoded.mimeType !== expectedType) return null;
    return file.content;
  }
  if (expectedType !== "image/svg+xml" || !file.content.trim().startsWith("<")) return null;

  const bytes = new TextEncoder().encode(file.content);
  return `data:${expectedType};base64,${encodeBase64(bytes)}`;
}

export function encodePreviewAsset(name: string, bytes: Uint8Array): string | null {
  const mimeType = previewMimeType(name);
  if (!isPreviewAssetPath(name) || mimeType === "image/svg+xml") return null;
  if (bytes.byteLength > PREVIEW_STORAGE_BYTE_LIMIT) return null;
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

export function previewStorageNamespace(ownerId: string, projectId: string): string {
  return `tinanai.preview-data.v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(projectId)}`;
}

export function readPreviewStorage(storage: StringStorage, namespace: string): Record<string, string> {
  try {
    const raw = storage.getItem(namespace);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed).filter(([key, value]) =>
      key.length <= 200 && typeof value === "string",
    ) as [string, string][];
    const result: Record<string, string> = {};
    for (const [key, value] of entries.slice(0, 250)) {
      result[key] = value;
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > PREVIEW_STORAGE_BYTE_LIMIT) {
        delete result[key];
        break;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function applyPreviewStorageOperation(
  storage: StringStorage,
  namespace: string,
  operation: PreviewStorageOperation,
): { ok: true } | { ok: false; error: string } {
  if (operation.op === "set" && (operation.key.length > 200 || operation.value.length > PREVIEW_STORAGE_BYTE_LIMIT)) {
    return { ok: false, error: "The project-local storage limit was exceeded." };
  }
  if (operation.op === "remove" && operation.key.length > 200) {
    return { ok: false, error: "The storage key is too long." };
  }

  const data = readPreviewStorage(storage, namespace);
  if (operation.op === "clear") {
    for (const key of Object.keys(data)) delete data[key];
  } else if (operation.op === "remove") {
    delete data[operation.key];
  } else {
    data[operation.key] = operation.value;
  }

  const serialized = JSON.stringify(data);
  if (new TextEncoder().encode(serialized).byteLength > PREVIEW_STORAGE_BYTE_LIMIT) {
    return { ok: false, error: "The project-local storage limit was exceeded." };
  }
  try {
    storage.setItem(namespace, serialized);
    return { ok: true };
  } catch {
    return { ok: false, error: "This browser could not save the project-local data." };
  }
}

export function validatePreviewDownload(payload: unknown): PreviewDownload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as { filename?: unknown; mimeType?: unknown; bytes?: unknown };
  if (typeof candidate.filename !== "string" || typeof candidate.mimeType !== "string") return null;
  const filename = candidate.filename
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .replace(/\.{2,}/g, "_")
    .trim()
    .slice(0, 120);
  const mimeType = candidate.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!filename || !ALLOWED_DOWNLOAD_TYPES.has(mimeType)) return null;

  let bytes: Uint8Array;
  if (candidate.bytes instanceof ArrayBuffer) bytes = new Uint8Array(candidate.bytes);
  else if (ArrayBuffer.isView(candidate.bytes)) {
    const view = candidate.bytes as ArrayBufferView;
    bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  } else return null;

  if (bytes.byteLength === 0 || bytes.byteLength > PREVIEW_DOWNLOAD_BYTE_LIMIT) return null;
  return { filename, mimeType, bytes: new Uint8Array(bytes) };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function validRelativePath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.startsWith("/") && !path.includes("\\") &&
    !path.split("/").some((part) => !part || part === "." || part === ".." || ["node_modules", ".git"].includes(part.toLowerCase())) &&
    !/^\.env(?:\.|$)/i.test(path.split("/").at(-1) ?? "");
}

export function createStaticPreviewDocument(
  files: PreviewRuntimeFile[],
  frameId: string,
  entryPath: string,
  storageSeed: Record<string, string> = {},
  redact: (content: string) => string = (content) => content,
): string {
  const safeFiles = files.filter((file) => validRelativePath(file.path));
  const entry = safeFiles.find((file) => file.path === entryPath && /\.html?$/i.test(file.path));
  if (!entry) return "";

  const byPath = new Map(safeFiles.map((file) => [file.path, file]));
  const localFiles = Object.fromEntries(safeFiles.map((file) => [
    file.path,
    isPreviewAssetPath(file.path) ? (previewAssetDataUri(file) ?? "") : redact(file.content),
  ]));
  const assetUris = new Map(safeFiles.flatMap((file) => {
    const dataUri = previewAssetDataUri(file);
    return dataUri ? [[file.path, dataUri] as const] : [];
  }));

  const rewriteCss = (css: string, basePath: string): string =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (original, quote: string, source: string) => {
      const value = source.trim();
      if (/^(?:data:|blob:|#|https?:|\/\/)/i.test(value)) return original;
      const path = resolveLocalProjectPath(basePath, value);
      const dataUri = path ? assetUris.get(path) : null;
      return dataUri ? `url("${dataUri}")` : original;
    });

  const inlineCss = (path: string, visited = new Set<string>()): string => {
    if (visited.has(path)) return "";
    visited.add(path);
    const file = byPath.get(path);
    if (!file) return "";
    const source = redact(file.content);
    const withImports = source.replace(
      /@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?\s*([^;]*);/gi,
      (original, _quote: string, requested: string, media: string) => {
        if (/^(?:data:|blob:|https?:|\/\/)/i.test(requested)) return original;
        const importedPath = resolveLocalProjectPath(path, requested);
        const imported = importedPath && /\.css$/i.test(importedPath)
          ? inlineCss(importedPath, visited)
          : "";
        if (!imported) return original;
        return media.trim() ? `@media ${media.trim()}{${imported}}` : imported;
      },
    );
    return rewriteCss(withImports, path);
  };

  let html = redact(entry.content);
  html = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "");
  html = html.replace(/<base\b[^>]*>/gi, "");
  html = html.replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  html = html.replace(/<link\b([^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*)>/gi, (tag, _attrs: string, source: string) => {
    if (!/\.css(?:[?#].*)?$/i.test(source)) {
      const path = resolveLocalProjectPath(entry.path, source);
      const dataUri = path ? assetUris.get(path) : null;
      return dataUri && /rel\s*=\s*["']?(?:icon|shortcut icon)["']?/i.test(tag)
        ? tag.replace(source, dataUri)
        : tag;
    }
    const path = resolveLocalProjectPath(entry.path, source);
    return path && byPath.has(path) ? `<style>${inlineCss(path).replace(/<\/style/gi, "<\\/style")}</style>` : tag;
  });
  html = html.replace(/<script\b([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>\s*<\/script>/gi, (tag, attrs: string, source: string) => {
    const path = resolveLocalProjectPath(entry.path, source);
    const file = path ? byPath.get(path) : undefined;
    if (!file || !/\.(?:js|mjs)$/i.test(file.path)) return tag;
    const attributes = attrs.replace(/\s+src\s*=\s*(["'])[^"']+\1/i, "");
    return `<script${attributes}>${redact(file.content).replace(/<\/script/gi, "<\\/script")}</script>`;
  });

  const rewriteAssetAttributes = (tag: string): string =>
    tag.replace(/\b(src|poster|href|xlink:href)\s*=\s*(["'])([^"']+)\2/gi, (original, _attribute: string, quote: string, source: string) => {
      if (/^(?:data:|blob:|#|https?:|\/\/)/i.test(source)) return original;
      const path = resolveLocalProjectPath(entry.path, source);
      const dataUri = path ? assetUris.get(path) : null;
      return dataUri ? `${_attribute}=${quote}${dataUri}${quote}` : original;
    });
  html = html.replace(/<(?:img|source|video|audio|track|image)\b[^>]*>/gi, rewriteAssetAttributes);
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_tag, attrs: string, css: string) =>
    `<style${attrs}>${rewriteCss(redact(css), entry.path)}</style>`,
  );
  html = html.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_tag, quote: string, css: string) =>
    ` style=${quote}${rewriteCss(css, entry.path)}${quote}`,
  );

  const runtime = `<script>
  (function(){
    var id=${safeJson(frameId)};
    var currentPath=${safeJson(entry.path)};
    var localFiles=${safeJson(localFiles)};
    var seed=${safeJson(storageSeed)};
    var objectUrls=new Map();
    function send(kind,message,payload){
      try{
        var event={type:'tinanai-preview',id:id,kind:kind,message:String(message||'')};
        if(payload!==undefined)event.payload=payload;
        if(kind==='download'&&payload&&payload.bytes instanceof ArrayBuffer)parent.postMessage(event,'*',[payload.bytes]);
        else parent.postMessage(event,'*');
      }catch(_){}
    }
    function makeStorage(initial,persistent){
      var values=new Map(Object.entries(initial||{}));
      return {
        getItem:function(key){key=String(key);return values.has(key)?values.get(key):null},
        setItem:function(key,value){
          key=String(key);value=String(value);
          var next=new Map(values);next.set(key,value);
          var bytes=new TextEncoder().encode(JSON.stringify(Object.fromEntries(next))).length;
          if(key.length>200||bytes>500000)throw new DOMException('Project storage limit exceeded','QuotaExceededError');
          values=next;
          if(persistent)send('storage','Project data saved in this browser.',{op:'set',key:key,value:value});
        },
        removeItem:function(key){key=String(key);values.delete(key);if(persistent)send('storage','Project data updated.',{op:'remove',key:key})},
        clear:function(){values.clear();if(persistent)send('storage','Project data cleared.',{op:'clear'})},
        key:function(index){return Array.from(values.keys())[index]||null},
        get length(){return values.size}
      };
    }
    var appStorage=makeStorage(seed,true);
    var session=makeStorage({},false);
    try{Object.defineProperty(window,'localStorage',{configurable:true,value:appStorage})}catch(_){window.tinanaiStorage=appStorage}
    try{Object.defineProperty(window,'sessionStorage',{configurable:true,value:session})}catch(_){}
    window.tinanaiStorage=appStorage;
    function decodeDataUri(uri){
      var comma=uri.indexOf(',');
      if(comma<0)return null;
      var header=uri.slice(5,comma).split(';');
      var type=header[0]||'application/octet-stream';
      try{
        var data=header.includes('base64')?Uint8Array.from(atob(uri.slice(comma+1)),function(c){return c.charCodeAt(0)}):new TextEncoder().encode(decodeURIComponent(uri.slice(comma+1)));
        return new Blob([data],{type:type});
      }catch(_){return null}
    }
    function resolveFile(source){
      var clean=String(source||'').split(/[?#]/,1)[0]||'';
      if(!clean||/^(?:[a-z]+:|\\/\\/)/i.test(clean))return null;
      var parts=clean.charAt(0)==='/'?[]:currentPath.split('/').slice(0,-1);
      clean.replace(/^\\/+/, '').split('/').forEach(function(part){
        if(!part||part==='.')return;
        if(part==='..'){if(parts.length)parts.pop();else parts=null;return}
        if(parts)parts.push(part)
      });
      return parts?parts.join('/'):null;
    }
    var nativeFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      var source=typeof input==='string'?input:input&&input.url||'';
      var method=String(init&&init.method||input&&input.method||'GET').toUpperCase();
      if(/^(?:data:|blob:)/i.test(source))return nativeFetch(input,init);
      var path=resolveFile(source);
      if(path===null||/^(?:https?:|\\/\\/)/i.test(source)){
        send('blocked','Network access is disabled in the static preview.');
        return Promise.reject(new TypeError('Network access is disabled in the static preview.'));
      }
      if(method!=='GET'&&method!=='HEAD'){
        send('blocked','Only local GET and HEAD requests are supported.');
        return Promise.reject(new TypeError('Only local GET and HEAD requests are supported.'));
      }
      if(!Object.prototype.hasOwnProperty.call(localFiles,path)){
        send('warn','Local file not found: '+path);
        return Promise.resolve(new Response(null,{status:404,statusText:'Not Found'}));
      }
      var value=localFiles[path]||'';
      var type=${safeJson("application/octet-stream")};
      var extension=path.split('.').pop().toLowerCase();
      var types={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',txt:'text/plain',md:'text/markdown',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
      type=types[extension]||type;
      var asset=decodeDataUri(value);
      if(asset){value=asset;type=asset.type||type}
      return Promise.resolve(value instanceof Blob?value.arrayBuffer().then(function(bytes){return new Response(method==='HEAD'?null:bytes,{status:200,headers:{'Content-Type':type}})}):new Response(method==='HEAD'?null:value,{status:200,headers:{'Content-Type':type}}));
    };
    var nativeCreate=URL.createObjectURL.bind(URL);
    var nativeRevoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=function(blob){var url=nativeCreate(blob);objectUrls.set(url,blob);return url};
    URL.revokeObjectURL=function(url){objectUrls.delete(url);return nativeRevoke(url)};
    function sendDownload(blob,name){
      if(!blob)return;
      blob.arrayBuffer().then(function(bytes){send('download','A project file is ready to download.',{filename:String(name||'download.bin'),mimeType:blob.type||'application/octet-stream',bytes:bytes})}).catch(function(){send('error','The generated download could not be prepared.')});
    }
    window.tinanaiDownload=function(filename,mimeType,content){
      var blob=content instanceof Blob?content:new Blob([content==null?'':String(content)],{type:String(mimeType||'application/octet-stream')});
      sendDownload(blob,filename);
    };
    document.addEventListener('click',function(event){
      var target=event.target;
      var link=target&&target.closest?target.closest('a'):null;
      if(!link)return;
      var href=link.getAttribute('href')||'';
      if(link.hasAttribute('download')){
        var blob=objectUrls.get(href)||decodeDataUri(href);
        var path=blob?null:resolveFile(href);
        if(!blob&&path&&Object.prototype.hasOwnProperty.call(localFiles,path))blob=decodeDataUri(localFiles[path])||new Blob([localFiles[path]],{type:'application/octet-stream'});
        if(blob){event.preventDefault();sendDownload(blob,link.getAttribute('download')||'download.bin');return}
      }
      if(href&&href.charAt(0)!=='#'){event.preventDefault();send('navigate',href)}
    },true);
    var violations=new Set();
    document.addEventListener('securitypolicyviolation',function(event){
      var key=event.violatedDirective||'blocked resource';
      if(violations.has(key))return;
      violations.add(key);
      send('blocked','A browser security policy blocked '+key+'.');
    });
    window.addEventListener('error',function(event){send('error',event.message||'Script error')});
    window.addEventListener('unhandledrejection',function(event){send('error',event.reason&&event.reason.message||event.reason||'Unhandled promise rejection')});
    window.addEventListener('DOMContentLoaded',function(){send('ready','Preview runtime started.')});
  })();
  </script>`;

  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => `${head}${policy}${runtime}`);
  return `${policy}${runtime}${html}`;
}
