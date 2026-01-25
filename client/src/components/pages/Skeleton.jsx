import React, { useState, useEffect, useContext, useCallback } from "react";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import { UserContext } from "../App";
import SlangSpace from "../SlangSpace";
import { get, post } from "../../utilities";
import "./Skeleton.css";

const Skeleton = () => {
  const { userId, handleLogin, handleLogout } = useContext(UserContext);

  const [slangs, setSlangs] = useState([]);
  const [currentSlang, setCurrentSlang] = useState(null);
  const [highlightSlang, setHighlightSlang] = useState(null);
  const [hoveredComment, setHoveredComment] = useState(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);

  // load all slangs from db
  useEffect(() => {
    get("/api/slangs").then((data) => {
      setSlangs(data || []);
    });
  }, []);

  const doSearch = () => {
    if (!input.trim() || loading) return;

    const term = input.trim().toLowerCase();
    setLoading(true);
    setStatus("connecting...");
    setCurrentSlang(null);

    const evtSource = new EventSource(`/api/slang/${encodeURIComponent(term)}/stream`);

    evtSource.addEventListener("status", (e) => {
      setStatus(JSON.parse(e.data).msg);
    });

    evtSource.addEventListener("cached", (e) => {
      const data = JSON.parse(e.data);
      setCurrentSlang(data);
      setHighlightSlang(data.term);
      setStatus("loaded from db");
    });

    evtSource.addEventListener("analysis", () => {
      setStatus("got analysis, fetching reddit...");
    });

    evtSource.addEventListener("result", (e) => {
      const data = JSON.parse(e.data);
      setCurrentSlang(data);
      setHighlightSlang(data.term);
      setSlangs((prev) => {
        if (prev.find((s) => s.term === data.term)) return prev;
        return [...prev, data];
      });
      setStatus("done");
    });

    evtSource.addEventListener("error", (e) => {
      setStatus("error: " + JSON.parse(e.data).msg);
      evtSource.close();
      setLoading(false);
    });

    evtSource.addEventListener("done", () => {
      evtSource.close();
      setLoading(false);
    });

    evtSource.onerror = () => {
      setStatus("connection failed");
      evtSource.close();
      setLoading(false);
    };
  };

  const saveSlang = async () => {
    if (!currentSlang || currentSlang.fromDb) return;

    try {
      await post("/api/slang/save", {
        term: currentSlang.term,
        currentMeaning: currentSlang.currentMeaning,
        periods: currentSlang.periods,
      });
      setCurrentSlang({ ...currentSlang, fromDb: true });
      setStatus("saved");
    } catch (err) {
      setStatus("save failed");
    }
  };

  const onHoverComment = useCallback((comment, slangTerm) => {
    setHoveredComment(comment ? { ...comment, slangTerm } : null);
  }, []);

  const onClickComment = useCallback((comment, slangTerm) => {
    setModal({ comment, slangTerm });
    setHighlightSlang(slangTerm);
    const found = slangs.find((s) => s.term === slangTerm);
    if (found) setCurrentSlang(found);
  }, [slangs]);

  return (
    <div className="app-container">
      {/* Left: 3D space */}
      <div className="left-panel">
        <SlangSpace
          slangs={slangs}
          highlightSlang={highlightSlang}
          onHoverComment={onHoverComment}
          onClickComment={onClickComment}
        />

        {/* hover info bottom-left */}
        {hoveredComment && (
          <div className="hover-info">
            <p className="hover-user">u/{hoveredComment.user}</p>
            {hoveredComment.time && <p className="hover-time">{hoveredComment.time}</p>}
            <p className="hover-text">{hoveredComment.text}</p>
          </div>
        )}
      </div>

      {/* Right: search + analysis */}
      <div className="right-panel">
        <div className="header">
          <h1>Slang Tracker</h1>
          {userId ? (
            <button onClick={() => { googleLogout(); handleLogout(); }}>logout</button>
          ) : (
            <GoogleLogin onSuccess={handleLogin} onError={console.log} />
          )}
        </div>

        {userId && (
          <>
            <div className="search-box">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="enter slang..."
                disabled={loading}
              />
              <button onClick={doSearch} disabled={loading}>
                {loading ? "..." : "go"}
              </button>
            </div>

            {status && <p className="status">{status}</p>}

            {currentSlang && (
              <div className="slang-info">
                <h2>"{currentSlang.term}"</h2>
                <p className="meaning">{currentSlang.currentMeaning}</p>

                <div className="timeline">
                  {currentSlang.periods?.map((p, i) => (
                    <div key={i} className="period">
                      <div className="period-head">
                        <span className="time">{p.timeRange}</span>
                      </div>
                      <p className="period-meaning">{p.meaning}</p>
                      <p className="origin">{p.origin}</p>
                      <p className="comment-count">
                        {p.comments?.length || 0} comments
                      </p>
                    </div>
                  ))}
                </div>

                {!currentSlang.fromDb && (
                  <button className="save-btn" onClick={saveSlang}>
                    save to collection
                  </button>
                )}
                {currentSlang.fromDb && (
                  <p className="saved-hint">in collection</p>
                )}
              </div>
            )}
          </>
        )}

        {!userId && <p className="login-hint">login to continue</p>}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setModal(null)}>×</button>
            <p className="modal-user">u/{modal.comment.user}</p>
            {modal.comment.time && <p className="modal-time">{modal.comment.time}</p>}
            <p className="modal-text">{modal.comment.text}</p>
            <p className="modal-slang">slang: {modal.slangTerm}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Skeleton;
