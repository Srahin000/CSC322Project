import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import AddCollaborator from "../Components/AddCollaborator";
import SidebarMenu from "../Components/SidebarMenu";

export default function MyFiles() {
  const [files, setFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFiles = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }
    
      // Fetch owned files
      const { data: ownedFiles, error: ownedError } = await supabase
        .from('texts')
        .select('id, title, created_at')
        .eq('user_id', session.user.id);
    
      // Fetch collaborations
      const { data: collaborationEntries, error: collabError } = await supabase
        .from('text_collaborators')
        .select('text_id')
        .eq('user_id', session.user.id);
    
      let collaboratorFiles = [];
    
      if (collaborationEntries?.length) {
        const textIds = collaborationEntries.map(entry => entry.text_id);
    
        const { data: texts, error: textError } = await supabase
          .from('texts')
          .select('id, title, created_at')
          .in('id', textIds);
    
        collaboratorFiles = texts || [];
      }
    
      if (ownedError || collabError) {
        console.error(ownedError || collabError);
      } else {
        setFiles([...ownedFiles, ...collaboratorFiles]);
      }
    };

    fetchFiles();
  }, []);

  const handleOpenFile = (id) => {
    navigate(`/editor/${id}`);
  };

  const handleAddCollaborator = (fileId) => {
    setSelectedFileId(fileId);
    setShowCollaboratorModal(true);
  };

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 p-6 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <button
            className="bg-blue-600 text-white px-6 py-3 mb-6 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
            onClick={() => navigate("/editor")}
          >
            ➕ New File
          </button>
          <h1 className="text-2xl font-extrabold mb-8 text-blue-800">My Files</h1>
          <div className="space-y-6">
            {files.map(file => (
              <div key={file.id} className="border border-blue-100 p-6 rounded-xl shadow-sm bg-blue-50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-blue-900 text-lg">{file.title}</p>
                    <p className="text-sm text-blue-500">
                      {new Date(file.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-600 transition"
                      onClick={() => handleOpenFile(file.id)}
                    >
                      Open
                    </button>
                    <button
                      className="bg-blue-400 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-500 transition"
                      onClick={() => handleAddCollaborator(file.id)}
                    >
                      Manage Collaborators
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {showCollaboratorModal && (
            <AddCollaborator
              fileId={selectedFileId}
              onClose={() => {
                setShowCollaboratorModal(false);
                setSelectedFileId(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
