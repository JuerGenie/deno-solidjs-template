import { Title } from "@solidjs/meta";
import { Errored, Loading } from "solid-js";
import { Router } from "./router.ts";
import "./App.css";

// The app root: the router and the site-wide layout live here. Pages are
// the modules under src/routes.
export default function App() {
  return (
    <Errored
      fallback={(err, reset) => (
        <div onClick={reset}>Error: {String(err())}</div>
      )}
    >
      <Router>
        {(props) => (
          <>
            <Title>Solid + Deno + Tailwind</Title>
            <Loading fallback={<main>Loading…</main>}>{props.children}</Loading>
          </>
        )}
      </Router>
    </Errored>
  );
}
