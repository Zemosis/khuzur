// APP - Main Application Component with Routing

import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthProvider from "./components/auth/AuthProvider";
import MainMenu from "./pages/MainMenu";

const GameThirteen = lazy(() => import("./pages/thirteen/GameThirteen"));
const LobbySelection = lazy(() => import("./pages/thirteen/LobbySelection"));
const GameMuushig = lazy(() => import("./pages/muushig/GameMuushig"));
const LobbyMuushig = lazy(() => import("./pages/muushig/LobbyMuushig"));
const GamePoker = lazy(() => import("./pages/poker/GamePoker"));
const LobbyPoker = lazy(() => import("./pages/poker/LobbyPoker"));
const GameBlackjack = lazy(() => import("./pages/blackjack/GameBlackjack"));
const LobbyBlackjack = lazy(() => import("./pages/blackjack/LobbyBlackjack"));
const AvatarPaint = lazy(() => import("./pages/AvatarPaint"));
const Profile = lazy(() => import("./pages/Profile"));
const MatchDetail = lazy(() => import("./pages/MatchDetail"));
const JoinTable = lazy(() => import("./pages/JoinTable"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Privacy = lazy(() => import("./pages/Privacy"));
const PatchNotes = lazy(() => import("./pages/PatchNotes"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Admin = lazy(() => import("./pages/Admin"));

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Suspense>
            <Routes>
              <Route path="/" element={<MainMenu />} />
              <Route path="/shop" element={<MainMenu />} />
              <Route path="/lobby-13" element={<LobbySelection />} />
              <Route path="/game-13" element={<GameThirteen />} />
              <Route path="/lobby-muushig" element={<LobbyMuushig />} />
              <Route path="/game-muushig" element={<GameMuushig />} />
              <Route path="/lobby-poker" element={<LobbyPoker />} />
              <Route path="/game-poker" element={<GamePoker />} />
              <Route path="/lobby-blackjack" element={<LobbyBlackjack />} />
              <Route path="/game-blackjack" element={<GameBlackjack />} />
              <Route path="/avatar-paint" element={<AvatarPaint />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/match/:id" element={<MatchDetail />} />
              <Route path="/join/:code" element={<JoinTable />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/patch-notes" element={<PatchNotes />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
