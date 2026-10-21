// Taunts the winner can send: full-screen "glitch" effects played one after another
const Taunt = (() => {
  const DURATION = 2000; // 2 seconds per effect (fast for chaining)

  // Queue state
  const queue = [];
  let playing = false;
  let currentTimeout = null;
  let currentContainer = null;

  const effects = {
    system_override: {
      name: 'SYSTEM OVERRIDE',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <div class="taunt-flicker" style="color:#22D3EE;font-family:monospace;font-size:3em;font-weight:bold;text-shadow:0 0 20px #22D3EE;">
              ACCESS DENIED
            </div>
            <div style="color:#EF4444;font-size:1.2em;margin-top:20px;font-family:monospace;">
              SYSTEM OVERRIDE IN PROGRESS...
            </div>
          </div>`;
      }
    },
    zero_sum: {
      name: 'ZERO SUM',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;">
            <div class="taunt-shockwave"></div>
            <div style="color:#22D3EE;font-size:4em;font-weight:bold;font-family:'Rajdhani',sans-serif;z-index:2;position:relative;text-shadow:0 0 30px #22D3EE;">
              ZERO SUM
            </div>
          </div>`;
      }
    },
    neural_lag: {
      name: 'NEURAL LAG',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen taunt-neural-lag" style="background:rgba(15,23,42,0.9);display:flex;align-items:center;justify-content:center;">
            <div style="color:#22D3EE;font-size:3em;font-weight:bold;animation:taunt-float 0.5s ease-in-out infinite alternate;text-shadow:0 0 20px #22D3EE;">
              NEURAL LAG DETECTED
            </div>
          </div>`;
        // Make board elements float
        document.querySelectorAll('.game-info, .board-wrapper, nav').forEach((el, i) => {
          el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
          el.style.transform = `translate(${Math.random()*40-20}px, ${Math.random()*40-20}px) rotate(${Math.random()*6-3}deg)`;
        });
        setTimeout(() => {
          document.querySelectorAll('.game-info, .board-wrapper, nav').forEach(el => {
            el.style.transform = '';
          });
        }, DURATION);
      }
    },
    ghost_shell: {
      name: 'GHOST IN THE SHELL',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;">
            <div style="color:#10B981;font-size:3em;font-weight:bold;opacity:0.8;animation:taunt-ghost 1s ease-in-out infinite;text-shadow:0 0 30px #10B981;">
              GHOST IN THE SHELL
            </div>
          </div>`;
      }
    },
    fragile: {
      name: 'FRAGILE',
      run(container, winnerName) {
        container.innerHTML = `
          <div class="taunt-fullscreen taunt-crack" style="background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <svg class="crack-svg" viewBox="0 0 400 400" style="position:absolute;width:100%;height:100%;opacity:0.6;">
              <line x1="200" y1="0" x2="180" y2="150" stroke="#22D3EE" stroke-width="2"/>
              <line x1="180" y1="150" x2="120" y2="250" stroke="#22D3EE" stroke-width="1.5"/>
              <line x1="180" y1="150" x2="250" y2="280" stroke="#22D3EE" stroke-width="1.5"/>
              <line x1="200" y1="0" x2="230" y2="120" stroke="#22D3EE" stroke-width="2"/>
              <line x1="230" y1="120" x2="300" y2="200" stroke="#22D3EE" stroke-width="1"/>
              <line x1="120" y1="250" x2="80" y2="400" stroke="#22D3EE" stroke-width="1"/>
              <line x1="250" y1="280" x2="350" y2="400" stroke="#22D3EE" stroke-width="1"/>
            </svg>
            <div style="color:#fff;font-size:3.5em;font-weight:bold;z-index:2;text-shadow:0 0 20px #22D3EE;animation:taunt-shatter 0.5s ease-out;">
              ${escapeHtml(winnerName || 'WINNER')}
            </div>
            <div style="color:#EF4444;font-size:1.5em;z-index:2;margin-top:10px;">FRAGILE</div>
          </div>`;
      }
    },
    the_void: {
      name: 'THE VOID',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:#000;display:flex;align-items:center;justify-content:center;">
            <div style="color:#22D3EE;font-size:5em;font-weight:bold;text-shadow:0 0 40px #22D3EE,0 0 80px #22D3EE;animation:taunt-pulse 0.8s ease-in-out infinite;">
              THE VOID
            </div>
          </div>`;
      }
    },
    data_leak: {
      name: 'DATA LEAK',
      run(container) {
        let matrixChars = '';
        for (let i = 0; i < 200; i++) {
          const left = Math.random() * 100;
          const delay = Math.random() * 2;
          const speed = 2 + Math.random() * 3;
          matrixChars += `<span class="matrix-char" style="left:${left}%;animation-delay:${delay}s;animation-duration:${speed}s;">${String.fromCharCode(0x30A0 + Math.random() * 96)}</span>`;
        }
        container.innerHTML = `
          <div class="taunt-fullscreen taunt-matrix" style="background:#000;overflow:hidden;">
            ${matrixChars}
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#22D3EE;font-size:2.5em;font-weight:bold;z-index:2;text-shadow:0 0 20px #22D3EE;font-family:monospace;">
              DATA LEAK DETECTED
            </div>
          </div>`;
      }
    },
    signal_loss: {
      name: 'SIGNAL LOSS',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:repeating-linear-gradient(0deg,#f00 0px,#f00 20px,#0f0 20px,#0f0 40px,#00f 40px,#00f 60px,#ff0 60px,#ff0 80px,#f0f 80px,#f0f 100px,#0ff 100px,#0ff 120px);display:flex;align-items:center;justify-content:center;animation:taunt-static 0.1s steps(5) infinite;">
            <div style="background:rgba(0,0,0,0.7);padding:20px 40px;border-radius:8px;">
              <div style="color:#fff;font-size:3em;font-weight:bold;font-family:monospace;">NO SIGNAL</div>
            </div>
          </div>`;
      }
    },
    chronos: {
      name: 'CHRONOS',
      run(container) {
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <div style="color:#22D3EE;font-size:4em;font-weight:bold;text-shadow:0 0 30px #22D3EE;animation:taunt-chronos 0.3s ease-in-out infinite;">
              CHRONOS
            </div>
            <div style="color:#10B981;font-size:1.5em;margin-top:15px;">TIME IS ON MY SIDE</div>
          </div>`;
      }
    },
    omok_god: {
      name: 'OMOK_GOD',
      run(container, winnerName, customMsg) {
        const msg = customMsg || 'GG EZ';
        container.innerHTML = `
          <div class="taunt-fullscreen" style="background:rgba(15,23,42,0.95);display:flex;align-items:center;justify-content:center;">
            <div class="taunt-popup" style="background:#1E293B;border:2px solid #22D3EE;border-radius:12px;padding:30px 40px;max-width:400px;text-align:center;box-shadow:0 0 40px rgba(34,211,238,0.3);">
              <div style="color:#EF4444;font-size:0.9em;margin-bottom:8px;">⚠ OMOK SYSTEM UPDATE</div>
              <div style="color:#fff;font-size:1.8em;font-weight:bold;margin-bottom:12px;">${escapeHtml(winnerName || 'WINNER')}</div>
              <div style="color:#22D3EE;font-size:1.2em;margin-bottom:20px;">${escapeHtml(msg)}</div>
              <div style="color:#334155;font-size:0.8em;">This popup will close automatically...</div>
            </div>
          </div>`;
      }
    }
  };

  const effectNames = Object.keys(effects);

  // Process the next item in the queue
  function processQueue() {
    if (queue.length === 0) {
      playing = false;
      return;
    }

    playing = true;
    const { effectKey, winnerName, customMsg } = queue.shift();
    const effect = effects[effectKey];
    if (!effect) {
      // Invalid effect, skip to next
      processQueue();
      return;
    }

    // Play sound with the effect key so each effect can have a unique sound
    Sound.playTaunt(effectKey);

    // Create a single container for this taunt
    const container = document.createElement('div');
    container.id = 'taunt-container';
    container.style.cssText = 'position:fixed;inset:0;z-index:500;pointer-events:all;';
    document.body.appendChild(container);
    currentContainer = container;

    // Impact flash (0-0.5s)
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;background:#22D3EE;z-index:501;animation:taunt-flash 0.5s ease-out forwards;';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);

    // Run effect (0.3s delay)
    setTimeout(() => {
      effect.run(container, winnerName, customMsg);
    }, 300);

    // Determine duration: if more taunts queued, shorten; otherwise full duration
    const actualDuration = queue.length > 0 ? 1400 : DURATION;
    const shrinkAt = queue.length > 0 ? 900 : DURATION - 500;

    // Shrink to corner
    setTimeout(() => {
      container.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      container.style.transform = 'scale(0.15)';
      container.style.transformOrigin = 'top right';
      container.style.borderRadius = '12px';
      container.style.overflow = 'hidden';
      container.style.opacity = '0';
    }, shrinkAt);

    // Remove container and process next in queue
    currentTimeout = setTimeout(() => {
      container.remove();
      currentContainer = null;
      currentTimeout = null;
      processQueue();
    }, actualDuration);
  }

  // Speed up current taunt if a new one arrives while playing
  function rushCurrent() {
    if (!playing || !currentContainer || !currentTimeout) return;
    // Cancel the scheduled removal
    clearTimeout(currentTimeout);
    // Immediately shrink and remove
    currentContainer.style.transition = 'all 0.3s ease-out';
    currentContainer.style.transform = 'scale(0.1)';
    currentContainer.style.opacity = '0';
    const c = currentContainer;
    currentContainer = null;
    currentTimeout = null;
    setTimeout(() => {
      c.remove();
      processQueue();
    }, 350);
  }

  // Public play method - enqueues the taunt and starts processing if idle
  function play(effectKey, winnerName, customMsg) {
    if (!effects[effectKey]) return;

    queue.push({ effectKey, winnerName, customMsg });

    if (!playing) {
      processQueue();
    } else {
      // Rush the currently playing taunt so the next one starts faster
      rushCurrent();
    }
  }

  // Check if a taunt is currently active
  function isPlaying() {
    return playing;
  }

  function getEffectList() {
    return effectNames.map(key => ({ key, name: effects[key].name }));
  }

  function getRandomEffect() {
    return effectNames[Math.floor(Math.random() * effectNames.length)];
  }

  // Send taunt via Supabase; resolves to { error }
  async function sendTaunt(roomId, sender, effectKey, message) {
    if (!db) return { error: new Error('offline') };
    const { error } = await db.from('taunts').insert({
      room_id: roomId,
      sender: sender,
      message: message || effects[effectKey]?.name || '',
      taunt_type: effectKey
    });
    return { error };
  }

  // Subscribe to incoming taunts
  function subscribeTaunts(roomId, myName, onTaunt) {
    if (!db) return null;
    return db
      .channel(`taunts-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'taunts',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        const taunt = payload.new;
        if (taunt.sender !== myName) {
          onTaunt(taunt);
        }
      })
      .subscribe();
  }

  return { play, isPlaying, getEffectList, getRandomEffect, sendTaunt, subscribeTaunts, effects };
})();
