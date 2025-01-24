document.addEventListener('DOMContentLoaded', () => {
    sessionStorage.removeItem('tutorialShown');
    
    const text1 = document.getElementById('text1');
    const text2 = document.getElementById('text2');
    const screen1 = document.getElementById('screen1');
    const screen2 = document.getElementById('screen2');
    const landing = document.getElementById('landing');
    
    function animateText(element, text, delay = 40) {
        element.innerHTML = '';
        const chars = text.split('');
        chars.forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char;
            span.className = 'char';
            element.appendChild(span);
            setTimeout(() => {
                span.classList.add('visible');
            }, index * delay);
        });
    }

    animateText(text1, text1.textContent);
    
    /* setTimeout(() => {
        screen1.classList.remove('active');
    }, 8000);

    setTimeout(() => {
        screen2.classList.add('active');
        animateText(text2, text2.textContent);
    }, 8500);
    
    setTimeout(() => {
        screen2.classList.remove('active');
    }, 16000);

    setTimeout(() => {
        landing.classList.add('active');
    }, 17000); */

    setTimeout(() => {
        screen1.classList.remove('active');
    }, 1);

    setTimeout(() => {
        screen2.classList.add('active');
        animateText(text2, text2.textContent);
    }, 1);
    
    setTimeout(() => {
        screen2.classList.remove('active');
    }, 2);

    setTimeout(() => {
        landing.classList.add('active');
    }, 2);
    
    // Box event listeners with view initialization
    const boxes = document.querySelectorAll('.landing-box');
    boxes.forEach(box => {
        box.addEventListener('click', () => {
            const view = box.dataset.view;
            localStorage.setItem('initialView', view);
            
            // Ensure view mode is properly initialized before redirecting
            if (view === 'materials-gallery') {
                const initData = {
                    view: 'gallery',
                    filter: 'Materials'
                };
                localStorage.setItem('viewInitData', JSON.stringify(initData));
            }
            
            window.location.href = 'network.html';
        });
    });
});