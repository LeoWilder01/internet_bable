import React, { useState, useEffect, useContext, useCallback } from "react";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
import { UserContext } from "../App";
import SlangSpace from "../SlangSpace";
import { get, post } from "../../utilities";
import "./Skeleton.css";

const Skeleton = () => {
  const { userId, handleLogin, handleLogout } = useContext(UserContext);

  const [slangs, setSlangs] = useState([]);
  const [tempSlang, setTempSlang] = useState(null); // 临时搜索结果（未保存）
  const [currentSlang, setCurrentSlang] = useState(null);
  const [highlightSlang, setHighlightSlang] = useState(null);
  const [hoveredComment, setHoveredComment] = useState(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const slangsRef = React.useRef(slangs); // 用 ref 避免回调依赖
  const tempSlangRef = React.useRef(tempSlang);

  // 保持 refs 同步
  useEffect(() => {
    slangsRef.current = slangs;
  }, [slangs]);

  useEffect(() => {
    tempSlangRef.current = tempSlang;
  }, [tempSlang]);

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
    setTempSlang(null); // 清除之前的临时结果

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
      // 新搜索结果先放入临时状态，不直接加入 slangs
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
      // 保存后：从临时状态移到正式列表
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

    // 检查是否点击的是临时片
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
      {/* Left: 3D space */}
      <div className="left-panel">
        <SlangSpace
          slangs={slangs}
          tempSlang={tempSlang}
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
