import {
  ClerkProvider,
  SignInButton,
  useAuth,
  UserButton,
} from "@clerk/clerk-react";
import {
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  // This error will be visible in the console if the key is missing
  console.error(
    "Missing Publishable Key. Please add VITE_CLERK_PUBLISHABLE_KEY to your .env.local file."
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <div
          style={{
            display: "flex",
            paddingRight: "1rem",
            justifyContent: "flex-end",
          }}
        >
          <Unauthenticated>
            <SignInButton mode="modal">
              <button className="btn">Sign In</button>
            </SignInButton>
          </Unauthenticated>
          <Authenticated>
            <UserButton />
          </Authenticated>
        </div>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>
);
