import { brand } from "@vygo/ui";

export default function HomePage() {
  return (
    <main>
      <p className="badge">vygo application</p>
      <h1>Vygo — production engineering for AI-built software</h1>
      <p className="lede">{brand.tagline}</p>
      <p>
        Welcome to the <strong>Vygo</strong> marketing platform workspace. This production web app
        is the public face of vygo.ai: a senior U.S.-based production engineering firm that
        preserves validated AI-built products and rebuilds the foundation underneath them.
      </p>
      <div className="panel">
        <p>
          <strong>Promise:</strong> {brand.promise}
        </p>
        <p>
          Machine endpoints: <code>/version</code> · <code>/api/readiness</code>
        </p>
      </div>
    </main>
  );
}
