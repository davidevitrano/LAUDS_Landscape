// locationPermissionPopup.js
class LocationPermissionPopup {
    constructor() {
        this.popup = null;
        this.overlay = null;
        this.onContinue = null;
    }

    async checkGeolocationPreference() {
        // First check if geolocation is supported
        if (!("geolocation" in navigator)) {
            return { granted: false, state: 'denied' };
        }

        try {
            // Check permission state
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            return {
                granted: permission.state === 'granted',
                state: permission.state  // 'granted', 'denied', or 'prompt'
            };
        } catch (error) {
            // If we can't check permissions, we'll have to test geolocation directly
            return new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    () => resolve({ granted: true, state: 'granted' }),
                    () => resolve({ granted: false, state: 'denied' }),
                    { timeout: 1000 }
                );
            });
        }
    }

    async show(onContinue) {
        this.onContinue = onContinue;

        // Check existing permissions first
        const { granted, state } = await this.checkGeolocationPreference();
        
        // If permission is already granted or denied, proceed without showing popup
        if (state !== 'prompt') {
            this.onContinue(granted);
            return;
        }

        // Create darkened overlay
        this.overlay = document.createElement('div');
        this.overlay.style.position = 'fixed';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.backgroundColor = 'rgba(236, 236, 236, 0.95)';
        this.overlay.style.zIndex = '999';
        document.body.appendChild(this.overlay);

        // Create popup container
        this.popup = document.createElement('div');
        this.popup.id = 'location-permission-popup';
        this.popup.className = 'location-popup visible';
        this.popup.style.zIndex = '1000';

        // Create popup content
        const content = `
            <h3>Location Access</h3>
            <p>To show the nearest urban producers relative to your position, LAUDS Landscape needs access to your location.</p>
            <p>Click continue to proceed with the browser's location request.</p>
            <div class="location-popup-buttons">
                <button id="continue-location" class="location-btn continue-btn">Continue</button>
            </div>
        `;

        this.popup.innerHTML = content;
        document.body.appendChild(this.popup);

        // Add event listener
        document.getElementById('continue-location').addEventListener('click', () => {
            this.handleContinue();
        });

        // Prevent clicks on elements behind the overlay
        this.overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    handleContinue() {
        this.hide();
        if (this.onContinue) {
            navigator.geolocation.getCurrentPosition(
                () => this.onContinue(true),
                () => this.onContinue(false)
            );
        }
    }

    hide() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
}

export default LocationPermissionPopup;