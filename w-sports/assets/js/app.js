/*
  W Sports App Logic
  - Shaka Player integration (DASH + ClearKey)
  - Responsive UI interactions: slideshow, search, channel grid, PiP
*/

(function () {
    'use strict';

    const videoElement = document.getElementById('video');
    const pipButton = document.getElementById('pipButton');
    const channelListElement = document.getElementById('channelList');
    const videoContainer = document.getElementById('videoContainer');
    const loader = document.getElementById('loader');
    const yearSpan = document.getElementById('year');
    const dots = Array.from(document.querySelectorAll('.dot'));
    const slides = document.querySelector('.slides');

    yearSpan.textContent = String(new Date().getFullYear());

    // Search input behavior
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => filterChannels(searchInput.value));

    // PiP support
    if (!document.pictureInPictureEnabled) {
        pipButton.style.display = 'none';
    }
    pipButton.addEventListener('click', () => {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        } else {
            videoElement.requestPictureInPicture().catch((error) => {
                console.error('Error entering PiP mode: ', error);
            });
        }
    });

    // Slider logic
    let activeSlide = 0;
    let sliderTimer = null;
    function goToSlide(index) {
        activeSlide = index % 3;
        slides.style.transform = `translateX(-${activeSlide * 100}%)`;
        dots.forEach((d, i) => d.classList.toggle('active', i === activeSlide));
    }
    function startSlider() {
        if (sliderTimer) clearInterval(sliderTimer);
        sliderTimer = setInterval(() => goToSlide(activeSlide + 1), 4500);
    }
    dots.forEach((dot) => dot.addEventListener('click', () => {
        const idx = Number(dot.dataset.index || 0);
        goToSlide(idx);
        startSlider();
    }));
    goToSlide(0);
    startSlider();

    // Shaka setup
    let player = null;
    function initShakaIfNeeded() {
        if (!player) {
            player = new shaka.Player(videoElement);
            const ui = new shaka.ui.Overlay(player, videoContainer, videoElement);
            ui.configure({
                controlPanelElements: [
                    'play_pause', 'mute', 'volume', 'spacer', 'time_and_duration', 'fullscreen', 'overflow_menu'
                ],
                overflowMenuButtons: ['quality', 'language', 'captions', 'playback_rate', 'cast']
            });

            player.addEventListener('error', (e) => {
                console.error('Shaka Error:', e.detail);
                hideLoader();
            });
        }
    }

    function showLoader() { loader.classList.remove('hidden'); loader.setAttribute('aria-hidden', 'false'); }
    function hideLoader() { loader.classList.add('hidden'); loader.setAttribute('aria-hidden', 'true'); }

    function parseClearKeys(keyString) {
        if (!keyString || typeof keyString !== 'string') return null;
        if (keyString.startsWith('http')) return null; // not supported as clearKeys map directly
        const pairs = keyString.split(',').map((s) => s.trim()).filter(Boolean);
        if (!pairs.length) return null;
        const map = {};
        for (const pair of pairs) {
            const [kid, k] = pair.split(':');
            if (!kid || !k) continue;
            map[kid.trim()] = k.trim();
        }
        return Object.keys(map).length ? map : null;
    }

    async function loadChannel(channel) {
        try {
            initShakaIfNeeded();
            videoElement.style.display = 'block';
            videoContainer.classList.add('active');
            showLoader();

            if (!shaka.Player.isBrowserSupported()) {
                alert('Browser yako haina msaada wa Shaka Player.');
                hideLoader();
                return;
            }

            await player.attach(videoElement);

            // Reset previous DRM config
            player.configure({ drm: { clearKeys: {} } });

            if ((channel.drm || '').toLowerCase() === 'clearkey') {
                const clearKeys = parseClearKeys(channel.key);
                if (clearKeys) {
                    player.configure({ drm: { clearKeys } });
                }
            }

            await player.load(channel.src);

            // Attempt autoplay muted if needed
            const tryPlay = async () => {
                try {
                    await videoElement.play();
                } catch (err) {
                    try {
                        videoElement.muted = true;
                        await videoElement.play();
                    } catch (e2) {
                        console.warn('Autoplay failed: user gesture required');
                    }
                }
            };
            await tryPlay();

            hideLoader();

            // Persist last played channel
            try { localStorage.setItem('w_sports_last_channel', channel.name); } catch {}
        } catch (error) {
            console.error('Error loading video:', error);
            hideLoader();
            alert('Tatizo kupakia channel: ' + channel.name);
        }
    }

    function renderChannels() {
        channelListElement.innerHTML = '';
        const fragment = document.createDocumentFragment();
        channels.forEach((channel, idx) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'button');
            li.setAttribute('tabindex', '0');
            li.dataset.index = String(idx);
            li.innerHTML = `<span class="title">${channel.name}</span><span class="meta">${(channel.drm || 'none').toUpperCase()}</span>`;

            li.addEventListener('click', () => selectChannel(idx));
            li.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectChannel(idx); });

            fragment.appendChild(li);
        });
        channelListElement.appendChild(fragment);

        // Restore active state if exists
        const lastName = (() => { try { return localStorage.getItem('w_sports_last_channel') || ''; } catch { return ''; } })();
        if (lastName) {
            const i = channels.findIndex((c) => c.name === lastName);
            if (i >= 0) markActive(i);
        }
    }

    function markActive(idx) {
        document.querySelectorAll('.channel-list li').forEach((el) => el.classList.remove('active'));
        const node = channelListElement.querySelector(`li[data-index="${idx}"]`);
        if (node) node.classList.add('active');
    }

    function selectChannel(idx) {
        const channel = channels[idx];
        if (!channel) return;
        markActive(idx);
        loadChannel(channel);
    }

    function filterChannels(query) {
        const q = String(query || '').toLowerCase();
        const items = channelListElement.querySelectorAll('li');
        items.forEach((li) => {
            const name = (li.querySelector('.title')?.textContent || '').toLowerCase();
            li.style.display = name.includes(q) ? '' : 'none';
        });
    }

    // Init
    document.addEventListener('DOMContentLoaded', () => {
        renderChannels();
        // Auto-select the first channel or last watched
        const lastName = (() => { try { return localStorage.getItem('w_sports_last_channel') || ''; } catch { return ''; } })();
        const idx = lastName ? channels.findIndex((c) => c.name === lastName) : 0;
        if (idx >= 0) selectChannel(idx);
    });
})();

