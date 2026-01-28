import React, { useState, useEffect, useContext, useCallback } from "react";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import { UserContext } from "../App";
import SlangSpace from "../SlangSpace";
import { get, post } from "../../utilities";
import "./Skeleton.css";

const Skeleton = () => {
  const { userId, handleLogin, handleLogout } = useContext(UserContext);

  const [slangs, setSlangs] = useState([]);
  const [tempSlang, setTempSlang] = useState(null); //temp result
  const [currentSlang, setCurrentSlang] = useState(null);
  const [highlightSlang, setHighlightSlang] = useState(null);
  const [hoveredComment, setHoveredComment] = useState(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [showIntro, setShowIntro] = useState(true); // intro modal
  const slangsRef = React.useRef(slangs); /////ref
  const tempSlangRef = React.useRef(tempSlang);

  //maintain refs
  useEffect(() => {
    slangsRef.current = slangs;
  }, [slangs]);

  useEffect(() => {
    tempSlangRef.current = tempSlang;
  }, [tempSlang]);

  // load all slangs
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
    setTempSlang(null); /////

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
      /////temp state
      setTempSlang(data);
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
      const savedSlang = { ...currentSlang, fromDb: true };
      setCurrentSlang(savedSlang);
      ///////update collection
      setSlangs((prev) => {
        if (prev.find((s) => s.term === savedSlang.term)) return prev;
        return [...prev, savedSlang];
      });
      setTempSlang(null);
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

    //check ( code advised by llm )//////////////////////
    const currentTemp = tempSlangRef.current;
    if (currentTemp && currentTemp.term === slangTerm) {
      // 点击临时片，不清除临时数据，设置 currentSlang 为临时数据
      setCurrentSlang(currentTemp);
      return;
    }

    // 点击已保存的片
    const found = slangsRef.current.find((s) => s.term === slangTerm);
    if (found) {
      setCurrentSlang(found);
      // 点击已保存的片时，清除临时搜索结果
      setTempSlang(null);
    }
  }, []);

  return (
    <div className="app-container">
      {/* 3D space */}
      <div className="left-panel">
        <SlangSpace
          slangs={slangs}
          tempSlang={tempSlang}
          highlightSlang={highlightSlang}
          onHoverComment={onHoverComment}
          onClickComment={onClickComment}
        />

        {/* bottom-left info */}
        {hoveredComment && (
          <div className="hover-info">
            <p className="hover-user">u/{hoveredComment.user}</p>
            {hoveredComment.time && <p className="hover-time">{hoveredComment.time}</p>}
            <p className="hover-text">{hoveredComment.text}</p>
          </div>
        )}

        {/* Intro */}
        {showIntro && (
          <div className="intro-overlay" onClick={() => setShowIntro(false)}>
            <div className="intro-modal" onClick={(e) => e.stopPropagation()}>
              <h1 className="intro-title">Internet Babel</h1>
              <p className="intro-subtitle">a semantic tracker</p>

              <div className="intro-text">
                <p>
                  This project is built on a simple idea: <strong>Context as a Language</strong>.
                </p>
                <p>
                  Rather than understanding each other only through the final words we speak, this
                  project invites us to understand one another through the process of thinking —
                  through context and background.
                </p>
              </div>

              <div className="intro-flow">
                <span className="flow-label">Initial Meaning</span>
                <span className="flow-arrow">→</span>
                <span className="flow-label">Key Events</span>
                <span className="flow-arrow">→</span>
                <span className="flow-label">Daily Usage</span>
                <span className="flow-arrow">→</span>
                <span className="flow-label">New Meaning</span>
                <span className="flow-arrow flow-loop">↻</span>
              </div>

              <button className="intro-enter-btn" onClick={() => setShowIntro(false)}>
                Enter
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right search + analysis */}
      <div className="right-panel">
        <div className="header">
          <h1>Slang Tracker</h1>
          {userId ? (
            <button
              onClick={() => {
                googleLogout();
                handleLogout();
              }}
            >
              logout
            </button>
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
                      <p className="comment-count">{p.comments?.length || 0} comments</p>
                    </div>
                  ))}
                </div>

                {!currentSlang.fromDb && (
                  <button className="save-btn" onClick={saveSlang}>
                    save to collection
                  </button>
                )}
                {currentSlang.fromDb && <p className="saved-hint">in collection</p>}
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
            <button className="close-btn" onClick={() => setModal(null)}>
              ×
            </button>
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
