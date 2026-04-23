const data = [
    {
        category: "Swim",
        icon: "🏊",
        items: [
            "Wetsuit (check seams + zipper)",
            "Goggles (clear + tinted)",
            "Swim cap (backup)",
            "Anti-fog spray",
            "Body glide / chamois cream"
        ]
    },
    {
        category: "Bike",
        icon: "🚴",
        items: [
            "Bike",
            "Helmet",
            "Cycling shoes + socks",
            "Sunglasses",
            "Bike computer / Garmin",
            "Spare tube + CO2",
            "Tire levers",
            "Multi-tool",
            "Water bottles (2x, filled)",
            "Nutrition (HIRONFOOD plan)"
        ]
    },
    {
        category: "Run",
        icon: "🏃",
        items: [
            "Running shoes + socks",
            "Race belt",
            "Cap or visor",
            "Run nutrition (gels)"
        ]
    },
    {
        category: "Transition & Race",
        icon: "🎒",
        items: [
            "Tri suit",
            "Towel",
            "Race number (bib)",
            "Timing chip",
            "T1 bag",
            "T2 bag",
            "Sunscreen",
            "Flip flops"
        ]
    },
    {
        category: "Pre-Race Day Before",
        icon: "📋",
        items: [
            "Race confirmation + ID",
            "Transition area recce",
            "Body marking",
            "Morning breakfast (oats)",
            "Phone charger",
            "Recovery drink"
        ]
    }
];

const listContainer = document.getElementById('packing-list');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

function init() {
    listContainer.innerHTML = '';
    data.forEach(cat => {
        const catDiv = document.createElement('div');
        catDiv.className = 'category';
        catDiv.innerHTML = `<h2>${cat.icon} ${cat.category}</h2>`;
        
        cat.items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'item';
            const id = `item-${item.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
            
            const isChecked = localStorage.getItem(id) === 'true';
            if (isChecked) itemDiv.classList.add('checked');

            itemDiv.innerHTML = `
                <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}>
                <label for="${id}">${item}</label>
            `;

            itemDiv.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                const cb = itemDiv.querySelector('input');
                cb.checked = !cb.checked;
                localStorage.setItem(id, cb.checked);
                itemDiv.classList.toggle('checked', cb.checked);
                updateProgress();
            });

            itemDiv.querySelector('input').addEventListener('change', () => {
                localStorage.setItem(id, itemDiv.querySelector('input').checked);
                itemDiv.classList.toggle('checked', itemDiv.querySelector('input').checked);
                updateProgress();
            });

            catDiv.appendChild(itemDiv);
        });
        listContainer.appendChild(catDiv);
    });
    updateProgress();
}

function updateProgress() {
    const total = document.querySelectorAll('input[type="checkbox"]').length;
    const checked = document.querySelectorAll('input[type="checkbox"]:checked').length;
    const percent = total === 0 ? 0 : Math.round((checked / total) * 100);
    
    progressBar.style.width = `${percent}%`;
    progressText.innerText = `${percent}% Complete (${checked}/${total})`;
    
    if (percent === 100) {
        progressText.style.color = '#28a745';
    } else {
        progressText.style.color = '#444';
    }
}

document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Clear all progress?')) {
        localStorage.clear();
        init();
    }
});

init();