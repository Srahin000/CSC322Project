import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; // 🆕
import supabase from './config/supabaseClient';
import SignIn from './Components/SignIn';
import Register from './Components/Register';
import SignOut from './Components/SignOut';
import TextEditor from './Components/TextCorrectionApp';
import FreeEditor from './Components/FreeTextEditor'; 
import MyFiles from './Pages/MyFiles'; // 🆕 import

export default function App() {
  const [session, setSession] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [freeMode, setFreeMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <Router>
      <div className="p-4 max-w-xl mx-auto">
        {session && <SignOut />} {/* Show SignOut if logged in */}

        <Routes>
          {/* Free mode (no login needed) */}
          {freeMode && (
            <Route path="*" element={<FreeEditor onExitFreeMode={() => setFreeMode(false)} />} />
          )}

          {/* Not logged in */}
          {!session && !freeMode && (
            <>
              <Route
                path="*"
                element={
                  showRegister ? (
                    <Register onSwitchToSignIn={() => setShowRegister(false)} />
                  ) : (
                    <SignIn onSwitchToRegister={() => setShowRegister(true)} />
                  )
                }
              />
            </>
          )}

          {/* Logged in */}
          {session && (
            <>
              <Route path="/editor" element={<TextEditor />} />
              <Route path="/editor/:fileId" element={<TextEditor />} />
              <Route path="/my-files" element={<MyFiles />} />
              {/* Default route: go to /editor */}
              <Route path="*" element={<Navigate to="/editor" />} />
            </>
          )}
        </Routes>

        {/* Only show Try for Free if not logged in */}
        {!session && !freeMode && (
          <div className="mt-4 text-center">
            <p>Want to try the app?</p>
            <button
              className="bg-purple-500 text-white px-4 py-2 mt-2"
              onClick={() => setFreeMode(true)}
            >
              Try for Free
            </button>
          </div>
        )}
      </div>
    </Router>
  );
}
