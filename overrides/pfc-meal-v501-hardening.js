// PFC Mirror Meal V5.0.1 hardening: in-editor voice control and footer-state recovery.
(() => {
  'use strict';
  const VERSION = '5.0.1';
  let editorRecognition = null;

  function ensureStyle() {
    if (document.getElementById('pfc-meal-v501-style')) return;
    const style = document.createElement('style');
    style.id = 'pfc-meal-v501-style';
    style.textContent = `.v50-footer-actions{display:grid;grid-template-columns:minmax(0,.42fr) minmax(0,1fr);gap:8px}.v50-voice-edit{border:1px solid #bfe0d1;border-radius:14px;background:#eef9f4;color:#167653;font-size:13px;font-weight:900;padding:13px 8px}.v50-voice-edit.is-listening{background:#dcf5e9;box-shadow:0 0 0 3px rgba(34,160,107,.12)}@media(max-width:360px){.v50-footer-actions{grid-template-columns:1fr}.v50-voice-edit{padding:10px}}`;
    document.head.appendChild(style);
  }

  function submitTranscript(text) {
    const input = document.getElementById('v-chat-input');
    const transcript = String(text || '').trim();
    if (!transcript || !input || typeof window.sendVoiceChat !== 'function') return false;
    input.value = transcript;
    input.disabled = false;
    window.sendVoiceChat();
    return true;
  }

  function startEditorVoice(voice, status) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (status) status.textContent = 'このブラウザは音声入力に対応していません。';
      return;
    }
    try { editorRecognition?.abort?.(); } catch {}
    const recognition = new SpeechRecognition();
    editorRecognition = recognition;
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;
    try { recognition.maxAlternatives = 3; } catch {}
    recognition.onstart = () => {
      voice.classList.add('is-listening');
      if (status) status.textContent = '話してください。例:「唐揚げを100gにして」「キャベツ消して」';
    };
    recognition.onresult = event => {
      const result = event?.results?.[0];
      const transcript = result?.[0]?.transcript || '';
      if (status) status.textContent = transcript ? `認識: ${transcript}` : '音声を認識できませんでした。';
      submitTranscript(transcript);
    };
    recognition.onerror = event => {
      if (status) status.textContent = event?.error === 'not-allowed' ? 'マイクの使用を許可してください。' : '音声入力に失敗しました。もう一度試してください。';
    };
    recognition.onend = () => {
      voice.classList.remove('is-listening');
      editorRecognition = null;
    };
    try { recognition.start(); }
    catch {
      voice.classList.remove('is-listening');
      if (status) status.textContent = '音声入力を開始できませんでした。';
    }
  }

  function ensureVoiceButton() {
    const host = document.getElementById('pfc-meal-editor-v50');
    const footer = host?.querySelector('footer');
    const commit = host?.querySelector('#v50-commit');
    if (!host || !footer || !commit || footer.querySelector('#v50-voice-edit')) return false;
    const wrap = document.createElement('div');
    wrap.className = 'v50-footer-actions';
    commit.parentNode.insertBefore(wrap, commit);
    wrap.appendChild(commit);
    const voice = document.createElement('button');
    voice.type = 'button';
    voice.id = 'v50-voice-edit';
    voice.className = 'v50-voice-edit';
    voice.textContent = '🎤 声で修正';
    wrap.insertBefore(voice, commit);
    voice.onclick = () => {
      const editor = window.__PFC_MEAL_EDITOR_V50__;
      const status = host.querySelector('#v50-status');
      if (!editor?.hasOpenDraft?.()) {
        if (status) status.textContent = '食品カードを開いてから音声修正を使ってください。';
        return;
      }
      if (editorRecognition) {
        try { editorRecognition.stop(); } catch {}
        return;
      }
      startEditorVoice(voice, status);
    };
    return true;
  }

  function recoverFooterForDraft() {
    const host = document.getElementById('pfc-meal-editor-v50');
    if (!host?.classList.contains('show')) return;
    const kicker = host.querySelector('#v50-kicker')?.textContent || '';
    if (kicker === 'PHOTO INPUT' || kicker === 'PHOTO AI') return;
    const footer = host.querySelector('footer');
    if (footer) footer.style.display = '';
  }

  function patchUnresolvedOpen() {
    const editor = window.__PFC_MEAL_EDITOR_V50__;
    if (!editor?.openFromUnresolved || editor.openFromUnresolved.__v501) return;
    const original = editor.openFromUnresolved;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      recoverFooterForDraft();
      ensureVoiceButton();
      return result;
    };
    wrapped.__v501 = true;
    editor.openFromUnresolved = wrapped;
  }

  function install() {
    ensureStyle();
    ensureVoiceButton();
    patchUnresolvedOpen();
    const host = document.getElementById('pfc-meal-editor-v50');
    if (host && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => { recoverFooterForDraft(); ensureVoiceButton(); });
      observer.observe(host,{attributes:true,subtree:true,childList:true,attributeFilter:['class','style']});
    }
    window.__PFC_MEAL_V501__ = { version:VERSION, inEditorVoice:true, editorVoiceIndependentAutoSend:true, footerRecovery:true, singleLayerPreserved:true };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
