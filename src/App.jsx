// APP - Main Application Component with Routing

import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import MainMenu from "./pages/MainMenu";

const GameThirteen = lazy(() => import("./pages/thirteen/GameThirteen"));
const LobbySelection = lazy(() => import("./pages/thirteen/LobbySelection"));
const GameMuushig = lazy(() => import("./pages/muushig/GameMuushig"));
const LobbyMuushig = lazy(() => import("./pages/muushig/LobbyMuushig"));
const GamePoker = lazy(() => import("./pages/poker/GamePoker"));
const LobbyPoker = lazy(() => import("./pages/poker/LobbyPoker"));
const AvatarPaint = lazy(() => import("./pages/AvatarPaint"));
const Profile = lazy(() => import("./pages/Profile"));
const JoinTable = lazy(() => import("./pages/JoinTable"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Privacy = lazy(() => import("./pages/Privacy"));

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Suspense>
            <Routes>
              <Route path="/" element={<MainMenu />} />
              <Route path="/lobby-13" element={<LobbySelection />} />
              <Route path="/game-13" element={<GameThirteen />} />
              <Route path="/lobby-muushig" element={<LobbyMuushig />} />
              <Route path="/game-muushig" element={<GameMuushig />} />
              <Route path="/lobby-poker" element={<LobbyPoker />} />
              <Route path="/game-poker" element={<GamePoker />} />
              <Route path="/avatar-paint" element={<AvatarPaint />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/join/:code" element={<JoinTable />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/privacy" element={<Privacy />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
