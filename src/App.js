import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import supabase from './config/supabaseClient';
import SignIn from './Components/SignIn';
import Register from './Components/Register';
import TextEditor from './Components/TextCorrectionApp';
import FreeEditor from './Components/FreeTextEditor';
import MyFiles from './Pages/MyFiles';
import SuperDashboard from './Pages/SuperDashboard';
import PurchaseTokens from './Pages/PurchaseTokens';
import SubmitBlacklist from './Pages/SubmitBlacklist';
import SubmitComplaint from './Pages/SubmitComplaint';
import CollaborationInvites from './Pages/Collaboration_Invites';
import ComplaintResponseModal from './Components/ComplaintResponseModal';

export default function App() {
  const [session, setSession] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [freeMode, setFreeMode] = useState(false);

  // Watch for auth state changes
  useEffect(() => {
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <Router>
        <Routes>
          {/* Free Mode */}
          {freeMode && (
            <Route path="*" element={<FreeEditor onExitFreeMode={() => setFreeMode(false)} />} />
          )}

          {/* Not Logged In */}
          {!session && !freeMode && (
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
          )}

          {/* Logged In */}
          {session && (
            <>
              <Route path="/editor" element={<TextEditor />} />
              <Route path="/editor/:fileId" element={<TextEditor />} />
              <Route path="/my-files" element={<MyFiles />} />
              <Route path="/super-dashboard" element={<SuperDashboard />} />
              <Route path="/purchase-tokens" element={<PurchaseTokens />} />
              <Route path="/submit-blacklist" element={<SubmitBlacklist />} />
              <Route path="/submit-complaint" element={<SubmitComplaint />} />
              <Route path="/collaboration-invites" element={<CollaborationInvites />} />
              {/* Default redirect to editor */}
              <Route path="*" element={<Navigate to="/editor" />} />
            </>
          )}
        </Routes>
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
      </Router>
      {/* Render ComplaintResponseModal outside of Router */}
      {session && <ComplaintResponseModal />}
    </>
  );
}
