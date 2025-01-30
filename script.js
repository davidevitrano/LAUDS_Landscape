// CSV file paths
const mainCsvFilePath = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbrRaZpcg6BmaLBiN1L5OF3MQ_hxr066EdOZlst486ALo-JcrBZBFyAO0wuC9I4zj7X_gpBY2YZrVF/pub?gid=0&single=true&output=csv";
const nodesCsvFilePath = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6Gx33rlVl6ozlAyr6rH24-Icfl5iRZdqOB0MsEVRY-lDVFhMLN9PvzvvI4bExcQGQx395mZnYvQWM/pub?gid=0&single=true&output=csv";

// Import your view components
import GalleryView from './gallery.js';
import NearestView from './nearest.js';
import LocationPermissionPopup from './locationPermissionPopup.js';
import TutorialOverlay from './tutorialOverlay.js';

// Initialize view variables
let galleryView = null;
let nearestView = null;
let currentView = 'network'; // Track current active view
let lastSelectedFilter = null;

// Global state for managing popups and highlighting
let globalState = {
    activeNode: null,
    isPopupOpen: false
};

// Data variables
let nodesArray = [];
let linksArray = [];
let simulation = null;
let svg = null;
let g = null;
let link = null;
let node = null;
let width = window.innerWidth;
let height = window.innerHeight;

// Funzione per salvare lo stato corrente
function saveCurrentState() {
    const state = {
        currentView: currentView,
        filters: {
            values: d3.select("#filter-values").property("checked"),
            materials: d3.select("#filter-materials").property("checked"),
            processes: d3.select("#filter-processes").property("checked"),
            knowledge: d3.select("#filter-knowledge").property("checked")
        }
    };
    localStorage.setItem('networkState', JSON.stringify(state));
}

// Funzione per ripristinare lo stato
function restoreState() {
    const savedState = localStorage.getItem('networkState');
    if (!savedState) return;

    const state = JSON.parse(savedState);
    
    // Mostra la network e i controlli
    document.getElementById('network').classList.remove('network-hidden');
    document.getElementById('network').classList.add('network-visible');
    document.querySelectorAll('.utility-button, #filters').forEach(el => {
        el.style.display = '';
    });
    
    // Ripristina i filtri
    d3.select("#filter-values").property("checked", state.filters.values);
    d3.select("#filter-materials").property("checked", state.filters.materials);
    d3.select("#filter-processes").property("checked", state.filters.processes);
    d3.select("#filter-knowledge").property("checked", state.filters.knowledge);

    // Ripristina la vista
    const viewButton = document.querySelector(`[data-mode="${state.currentView}"]`);
    if (viewButton) {
        viewButton.click();
    }
}

// Function to cleanup current view
function cleanupCurrentView() {
    switch (currentView) {
        case 'network':
            if (svg) {
                svg.style("display", "none");
            }
            break;
        case 'gallery':
            if (galleryView) {
                galleryView.hide();
            }
            break;
        case 'nearest':
            if (nearestView) {
                nearestView.hide();
            }
            break;
    }
}

// Function to update visualization based on filters and current view
function updateVisualization() {
    if (currentView === 'network') {
        // Code to filter and redraw the network (existing logic)
        const filters = {
            "Values": d3.select("#filter-values").property("checked"),
            "Materials": d3.select("#filter-materials").property("checked"),
            "Processes and Technologies": d3.select("#filter-processes").property("checked"),
            "Knowledge Sharing": d3.select("#filter-knowledge").property("checked")
        };

        const filteredLinks = linksArray.filter(l => filters[l.target.group]);
        const connectedNodes = new Set(filteredLinks.flatMap(l => [l.source.id, l.target.id]));
        const finalNodes = nodesArray.filter(d =>
            d.group === 'main' && connectedNodes.has(d.id) ||
            d.group !== 'main' && filters[d.group]
        );

        const currentTransform = d3.zoomTransform(svg.node());
        g.selectAll(".link, .node").remove();
        link = createLinks(filteredLinks);
        node = createNodes(finalNodes);
        g.attr("transform", currentTransform);
        g.selectAll(".node").each(function () {
            const node = d3.select(this);
            node.selectAll("circle, rect, polygon")
                .attr("transform", `scale(${1 / currentTransform.k})`);
            node.select("text")
                .attr("transform", `scale(${1 / currentTransform.k})`);
        });
        g.selectAll(".link")
            .style("stroke-width", `${1.5 / currentTransform.k}px`);

        simulation.nodes(finalNodes);
        simulation.force("link").links(filteredLinks);
        simulation.alpha(1).restart();
    } else if (currentView === 'gallery') {
        // Update gallery view visibility
        if (galleryView) {
            galleryView.updateVisibility();
        }
    }
    // No specific action needed for 'nearest' view as filters don't apply there
}

// Function to reset global state
function resetGlobalState() {
    globalState = {
        activeNode: null,
        isPopupOpen: false
    };
    d3.select("#popup").remove();
    if (g) {
        removeHighlight();
    }
}

// Function to create links
function createLinks(linksData) {
    return g.selectAll(".link")
        .data(linksData)
        .enter().append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.6);
}

// Highlighting logic
function highlightNodes(selectedNode) {
    // Find all connected nodes
    const connectedIds = new Set([selectedNode.id]);

    // Find directly connected nodes
    linksArray.forEach(link => {
        if (link.source.id === selectedNode.id) {
            connectedIds.add(link.target.id);
        }
        if (link.target.id === selectedNode.id) {
            connectedIds.add(link.source.id);
        }
    });

    // Apply highlight/dim classes
    g.selectAll(".node")
        .classed("highlight", d => connectedIds.has(d.id))
        .classed("dim", d => !connectedIds.has(d.id));

    g.selectAll(".link")
        .classed("highlight", d =>
            connectedIds.has(d.source.id) && connectedIds.has(d.target.id))
        .classed("dim", d =>
            !(connectedIds.has(d.source.id) && connectedIds.has(d.target.id)));
}

// Remove highlighting
function removeHighlight() {
    g.selectAll(".node")
        .classed("highlight", false)
        .classed("dim", false);

    g.selectAll(".link")
        .classed("highlight", false)
        .classed("dim", false);
}

// Function to create nodes
function createNodes(nodesData) {
    const node = g.selectAll(".node")
        .data(nodesData)
        .enter().append("g")
        .attr("class", "node")
        .attr("id", d => d.id)
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Add shapes for each node type
    node.each(function (d) {
        if (d.group === 'main') {
            d3.select(this).append("circle")
                .attr("r", 12)
                .attr("stroke", "#FF5C00")
                .attr("stroke-width", 2)
                .attr("fill", "none");
        } else if (d.group === 'Values') {
            d3.select(this).append("polygon")
                .attr("points", "-8,-8 8,-8 4,0 8,8 -8,8 -4,0")
                .attr("fill", "#FF5C00")
                .attr("class", "value-node");
        } else if (d.group === 'Materials') {
            d3.select(this).append("rect")
                .attr("width", 16)
                .attr("height", 16)
                .attr("x", -8)
                .attr("y", -8)
                .attr("fill", "#FF5C00")
                .attr("class", "material-node");
        } else if (d.group === 'Processes and Technologies') {
            d3.select(this).append("polygon")
                .attr("points", "-10,10 10,10 0,-10")
                .attr("fill", "#FF5C00")
                .attr("class", "process-node");
        } else if (d.group === 'Knowledge Sharing') {
            d3.select(this).append("polygon")
                .attr("points", "-10,0 -5,9 5,9 10,0 5,-9 -5,-9")
                .attr("fill", "#FF5C00")
                .attr("class", "knowledge-node");
        }
    });

    // Add text to nodes
    node.append("text")
        .attr("dy", d => d.group === 'main' ? -20 : -15)
        .attr("dx", 0)
        .attr("text-anchor", "middle")
        .attr("class", d => d.group === 'main' ? 'font-size-small' : 'font-size-small')
        .text(d => d.id);

    // Node interaction handling
    node.on("mouseover.highlight", function (event, d) {
        if (!globalState.isPopupOpen) {
            highlightNodes(d);
        }
    })
        .on("mouseout.highlight", function () {
            if (!globalState.isPopupOpen) {
                removeHighlight();
            }
        });

    // Click handling for nodes
    node.on("click.popup", function (event, d) {
        event.stopPropagation();

        // Update global state
        globalState.activeNode = d;
        globalState.isPopupOpen = true;

        // Remove existing popup and create new one
        d3.select("#popup").remove();
        if (d.group === 'main') {
            createMainPopup(null, d);
        } else {
            createCategoryPopup(null, d);
        }

        // Apply highlight to clicked node
        removeHighlight();
        highlightNodes(d);
    });

    return node;
}

// Functions for node dragging
function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// Function to create popup for main nodes
function createMainPopup(event, d) {
    // Remove any existing popups
    d3.select("#popup").remove();

    // Create the new popup
    const newPopup = d3.select("body").append("div")
        .attr("id", "popup")
        .attr("class", "visible");

    // Prepare links section with conditional rendering
    const linksSection = `
    <div class="popup-links">
        ${d.links ? `
        <label class="link-label">
            <a href="${d.links}" target="_blank" class="popup-link font-size-small">Website</a>
        </label>
        ` : ''}
        ${d.igLink ? `
        <label class="link-label">
            <a href="${d.igLink}" target="_blank" class="popup-link font-size-small">Instagram</a>
        </label>
        ` : ''}
        ${d.linkedinLink ? `
        <label class="link-label">
            <a href="${d.linkedinLink}" target="_blank" class="popup-link font-size-small">LinkedIn</a>
        </label>
        ` : ''}
    </div>
`;

    // Popup content with styled connected nodes
    const popupContent = `
    <button id="close-popup" class="popup-close">×</button>
    <div>Urban Producers</div>
    <h3>${d.id}</h3>
    ${d.location ? `<div><p>${d.location}</p></div>` : ''}
    ${d.description ? `<div><p>${d.description}</p></div>` : ''}
    
    ${linksSection}

    <div class="popup-line"></div>

    ${Object.entries(d.connectedNodes).map(([category, nodes]) => `
        <div class="connected-category">
            <h3>${category}</h3>
            <div class="connected-nodes-container">
                ${nodes.map(node => `
                    <label class="connected-node-label">
                        <button class="connected-node-btn font-size-small" data-node-id="${node}">${node}</button>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('')}
`;

    newPopup.html(popupContent);

    // Handle popup close button
    d3.select("#close-popup").on("click", () => {
        newPopup.remove();
        removeHighlight();
        globalState.isPopupOpen = false;
        globalState.activeNode = null;
    });

    // Handle connected node button clicks
    d3.selectAll(".connected-node-btn").on("click", function () {
        const nodeId = d3.select(this).attr("data-node-id");
        const targetNode = nodesArray.find(n => n.id === nodeId);

        if (!targetNode) {
            console.error('Target node not found:', nodeId);
            return;
        }

        // Check if the node is currently visible in the network
        const isNodeVisible = g.select(`#${CSS.escape(targetNode.id)}`).size() > 0;

        if (!isNodeVisible) {
            // Map group names to filter IDs
            const filterMap = {
                'Values': 'filter-values',
                'Materials': 'filter-materials',
                'Processes and Technologies': 'filter-processes',
                'Knowledge Sharing': 'filter-knowledge'
            };

            // Get the correct filter ID
            const filterId = filterMap[targetNode.group];

            if (filterId) {
                const filterCheckbox = d3.select(`#${filterId}`);
                if (!filterCheckbox.property("checked")) {
                    filterCheckbox.property("checked", true);
                    filterCheckbox.dispatch("change");
                }
            }

            // Wait for the filter to take effect
            setTimeout(centerOnNode, 100);
        } else {
            centerOnNode();
        }

        // Remove current popup
        d3.select("#popup").remove();

        // Create popup for clicked node
        if (targetNode.group === 'main') {
            createMainPopup(null, targetNode);
        } else {
            createCategoryPopup(null, targetNode);
        }

        // Update highlights
        removeHighlight();
        highlightNodes(targetNode);

        // Update global state
        globalState.activeNode = targetNode;
        globalState.isPopupOpen = true;

        // Function to center on node
        function centerOnNode() {
            // Force node position update
            simulation.alpha(0.3).restart();

            // Get the current zoom state
            const currentTransform = d3.zoomTransform(svg.node());
            const scale = currentTransform.k;

            // Calculate the translation needed to center on the node
            const tx = width / 2 - targetNode.x * scale;
            const ty = height / 2 - targetNode.y * scale;

            // Add smooth transition
            svg.transition()
                .duration(1000)  // Duration of the animation in milliseconds
                .ease(d3.easeQuadInOut)  // Smooth easing function
                .call(
                    d3.zoom().transform,
                    d3.zoomIdentity
                        .translate(tx, ty)
                        .scale(scale)
                );
        }
    });

}

// Function to create legend popup (updated version)
function createLegendPopup() {
    // Remove any existing popups
    d3.select("#popup").remove();

    // Create the new popup
    const newPopup = d3.select("body").append("div")
        .attr("id", "popup")
        .attr("class", "visible");

    const popupContent = `
        <button id="close-popup" class="popup-close">×</button>
        <p>This interface allows the free exploration of the sustainable urban manufacturing panorama in Europe. Sustainable urban production is based on connections that are created between realities and people who communicate, share and support each other. These connections would not exist without a series of words, concepts, materials and technologies that form their foundation.</p>
        <p>Explore these connections and maps that are created, through the selection of different filters and views, selected to provide the best insights, ideas, from the visualisations.</p>
        
        <div class="popup-line"></div>
        
        <div class="connected-category"><h3>Network Visualisation</h3></div>
        <p>See how different sustainable urban production realities in Europe are connected with different values, materials, processes and how they approach knowledge sharing in their spaces. Filter the visualisation to explore and click on the different nodes for additional information.</p>
        <div class="network-section">
            <div class="network-header">
                <div class="legend-container">
                <div class="legend-item">
                    <img src="assets/images/legend-producer.svg" alt="Producer node" class="legend-icon">
                    <span class="font-size-small">Urban Producers</span>
                </div>
                <div class="legend-item">
                    <img src="assets/images/legend-values.svg" alt="Values node" class="legend-icon">
                    <span class="font-size-small">Values</span>
                </div>
                <div class="legend-item">
                    <img src="assets/images/legend-materials.svg" alt="Materials node" class="legend-icon">
                    <span class="font-size-small">Materials</span>
                </div>
                <div class="legend-item">
                    <img src="./assets/images/legend-processes.svg" alt="Processes node" class="legend-icon">
                    <span class="font-size-small">Processes and Technologies</span>
                </div>
                <div class="legend-item">
                    <img src="https://github.com/davidevitrano/LAUDS_Landscape/blob/main/assets/images/legend-knowledge.svg" alt="Knowledge node" class="legend-icon">
                    <span class="font-size-small">Knowledge Sharing</span>
                </div>
            </div>
            <img src="assets/images/network-preview.svg" alt="Network preview" class="network-preview">
            </div>
            

        <div class="popup-line"></div>
        <div class="connected-category">
        <h3>Gallery Visualisation</h3></div>
        <p>Urban production realities do not speak only in words but also using images and their visual communication is essential to discover the photos associated with the key concepts of the research. Each concept must also be discovered in its visual side. Find out which images belong to the same manufacturer by hovering over them or by clicking on them.</p>

        <div class="popup-line"></div>
        <div class="connected-category">
        <h3>Nearest Visualisation</h3></div>
        <p>Check which urban producers are closest to you or more generally where they are positioned. See how the realities are arranged more or less close to the left representing your position. This visualization is simply used to have a more interactive view of the urban production realities collected and analyzed, it absolutely does not represent the complete European panorama.</p>
    `;

    newPopup.html(popupContent);

    // Handle popup close button
    d3.select("#close-popup").on("click", () => {
        newPopup.remove();
        globalState.isPopupOpen = false;
    });

    globalState.isPopupOpen = true;
}

// Function to create popup for category nodes
function createCategoryPopup(event, d) {
    // Remove any existing popups
    d3.select("#popup").remove();

    // Create the new popup
    const newPopup = d3.select("body").append("div")
        .attr("id", "popup")
        .attr("class", "visible");

    // Find connected main nodes (Urban Producers)
    const connectedProducers = linksArray
        .filter(link => link.target.id === d.id)
        .map(link => link.source)
        .filter(node => node.group === 'main');

    // Popup content with connected Urban Producers
    const popupContent = `
        <button id="close-popup" class="popup-close">×</button>
        <div>${d.group}</div>
        <h3>${d.id}</h3>
        ${d.description ? `<div><p>${d.description}</p></div>` : ''}
        
        <div class="popup-line"></div>

        <div class="connected-category">
            <h3>Urban Producers</h3>
            <div class="connected-nodes-container">
                ${connectedProducers.map(producer => `
                    <label class="connected-node-label">
                        <button class="connected-node-btn font-size-small" data-node-id="${producer.id}">${producer.id}</button>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    newPopup.html(popupContent);

    // Handle popup close button
    d3.select("#close-popup").on("click", () => {
        newPopup.remove();
        removeHighlight();
        globalState.isPopupOpen = false;
        globalState.activeNode = null;
    });

    // Handle connected node button clicks
    d3.selectAll(".connected-node-btn").on("click", function () {
        const nodeId = d3.select(this).attr("data-node-id");
        const targetNode = nodesArray.find(n => n.id === nodeId);

        if (!targetNode) {
            console.error('Target node not found:', nodeId);
            return;
        }

        // Check if the node is currently visible in the network
        const isNodeVisible = g.select(`#${CSS.escape(targetNode.id)}`).size() > 0;

        if (!isNodeVisible) {
            // Map group names to filter IDs
            const filterMap = {
                'Values': 'filter-values',
                'Materials': 'filter-materials',
                'Processes and Technologies': 'filter-processes',
                'Knowledge Sharing': 'filter-knowledge'
            };

            // Get the correct filter ID
            const filterId = filterMap[targetNode.group];

            if (filterId) {
                const filterCheckbox = d3.select(`#${filterId}`);
                if (!filterCheckbox.property("checked")) {
                    filterCheckbox.property("checked", true);
                    filterCheckbox.dispatch("change");
                }
            }

            // Wait for the filter to take effect
            setTimeout(centerOnNode, 100);
        } else {
            centerOnNode();
        }

        // Remove current popup
        d3.select("#popup").remove();

        // Create popup for clicked node
        createMainPopup(null, targetNode);

        // Update highlights
        removeHighlight();
        highlightNodes(targetNode);

        // Update global state
        globalState.activeNode = targetNode;
        globalState.isPopupOpen = true;

        // Function to center on node
        function centerOnNode() {
            // Force node position update
            simulation.alpha(0.3).restart();

            // Get the current zoom state
            const currentTransform = d3.zoomTransform(svg.node());
            const scale = currentTransform.k;

            // Calculate the translation needed to center on the node
            const tx = width / 2 - targetNode.x * scale;
            const ty = height / 2 - targetNode.y * scale;

            // Add smooth transition
            svg.transition()
                .duration(1000)  // Duration of the animation in milliseconds
                .ease(d3.easeQuadInOut)  // Smooth easing function
                .call(
                    d3.zoom().transform,
                    d3.zoomIdentity
                        .translate(tx, ty)
                        .scale(scale)
                );
        }
    });
}

// Initially hide the network and controls
document.getElementById('network').classList.add('network-hidden');
document.querySelectorAll('.utility-button, #filters').forEach(el => {
    el.style.display = 'none';
});

// Add this function to handle filter states based on view
function updateFilterStates(viewMode) {
    // Reset all filters first
    document.querySelectorAll('.filter-label-values, .filter-label-materials, .filter-label-processes, .filter-label-knowledge')
        .forEach(filter => filter.classList.remove('filter-disabled'));

    switch (viewMode) {
        case 'gallery':
            document.querySelector('.filter-label-values').classList.add('filter-disabled');
            break;
        case 'nearest':
            document.querySelectorAll('.filter-label-values, .filter-label-materials, .filter-label-processes, .filter-label-knowledge')
                .forEach(filter => filter.classList.add('filter-disabled'));
            break;
    }
}

// Setup view mode buttons
document.querySelectorAll('.segment-btn').forEach(button => {
    button.addEventListener('click', () => {
        const previousMode = currentView;
        const newMode = button.dataset.mode;

        // Check if switching from network to gallery with only Values filter
        if (previousMode === 'network' && newMode === 'gallery') {
            const selectedFilters = d3.selectAll('#filters input:checked');
            if (selectedFilters.size() === 1 && selectedFilters.node().value === 'Values') {
                // Uncheck Values and check Materials
                d3.select('#filter-values').property('checked', false);
                d3.select('#filter-materials').property('checked', true);
                lastSelectedFilter = 'Materials';

                // Trigger the filter change event
                const event = new Event('change');
                d3.select('#filter-materials').node().dispatchEvent(event);
            }
        }

        // Remove active class from all buttons
        document.querySelectorAll('.segment-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        button.classList.add('active');
        cleanupCurrentView();

        // Handle view mode change
        switch (newMode) {
            case 'network':
                if (nearestView) nearestView.hide();
                if (galleryView) galleryView.hide();
                svg.style("display", "block");
                currentView = 'network';
                updateVisualization(); // Call updateVisualization after switching to network view
                break;
            case 'gallery':
                if (nearestView) {
                    nearestView.destroy();
                    nearestView = null;
                }
                if (!galleryView) {
                    galleryView = new GalleryView("#network");
                    galleryView.initialize();
                } else {
                    galleryView.show();
                }
                currentView = 'gallery';
                break;

            case 'nearest':
                if (galleryView) {
                    galleryView.destroy();
                    galleryView = null;
                }

                const handleGeolocation = (hasPermission) => {
                    if (!nearestView) {
                        // Create new nearest view with geolocation enabled/disabled based on permission
                        nearestView = new NearestView("#network", hasPermission);
                        nearestView.initialize();
                    } else {
                        nearestView.show();
                    }
                    currentView = 'nearest';
                };

                const locationPopup = new LocationPermissionPopup();
                locationPopup.show(handleGeolocation);
                break;
        }
        // Add this after setting currentView:
        updateFilterStates(newMode);
        saveCurrentState();
    });
});

// Modify the filter change event handler
d3.selectAll("#filters input").on("change", function () {
    const checkbox = d3.select(this);
    const selectedFilters = d3.selectAll("#filters input:checked");

    // If trying to uncheck the last selected filter, prevent it
    if (selectedFilters.size() === 0) {
        checkbox.property("checked", true);
        return;
    }

    // Store the last selected filter
    if (checkbox.property("checked")) {
        lastSelectedFilter = checkbox.property("value");
    }

    // Reset global state and update visualization regardless of the current view
    resetGlobalState();
    updateVisualization();
    // Aggiungi il salvataggio dello stato
    saveCurrentState();
});

// Add click event listener to legend button
d3.select("#legend-button").on("click", function (event) {
    event.stopPropagation();
    createLegendPopup();
});

// Add click event listener to dataset button
d3.select("#dataset-button").on("click", function (event) {
    event.stopPropagation();
    window.location.href = 'dataset.html';
});

const tutorialOverlay = new TutorialOverlay();

// Combine data from both CSVs and initialize the network
Promise.all([
    d3.csv(mainCsvFilePath),
    d3.csv(nodesCsvFilePath)
]).then(function ([mainData, nodesData]) {
    // Create a lookup for node descriptions
    const nodeDescriptions = {};
    nodesData.forEach(node => {
        nodeDescriptions[node.Nodes] = {
            description: node.Description,
            category: node.Category
        };
    });

    // Transform data into nodes and links
    const nodes = {};
    linksArray = [];

    const columns = ["Values", "Materials", "Processes and Technologies", "Knowledge Sharing"];
    mainData.forEach(d => {
        nodes[d.Name] = {
            id: d.Name,
            group: 'main',
            description: d.Description,
            links: d.Website,
            location: d.Location,
            igLink: d['IG Link'],
            linkedinLink: d['Linkedin Link'],
            connectedNodes: {}
        };

        columns.forEach(col => {
            if (d[col]) {
                nodes[d.Name].connectedNodes[col] = d[col].split(", ");
                d[col].split(", ").forEach(value => {
                    if (!nodes[value]) {
                        const nodeInfo = nodesData.filter(data => data.Node == value);
                        const info = nodeInfo.length > 0 ? nodeInfo[0] : {};

                        nodes[value] = {
                            id: value,
                            group: col,
                            description: info.nodesDescription || '',
                            category: info.Category || col
                        };
                    }
                    linksArray.push({ source: d.Name, target: value });
                });
            }
        });
    });

    // Convert objects to arrays for D3
    nodesArray = Object.values(nodes);

    // Create the SVG for visualization
    svg = d3.select("#network").append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("background-color", "#ECECEC")
        .call(d3.zoom()
            .scaleExtent([0.6, 5])
            .on("zoom", (event) => {
                const transform = event.transform;
                g.attr("transform", transform);
                g.selectAll(".node").each(function () {
                    const node = d3.select(this);
                    node.selectAll("circle, rect, polygon")
                        .attr("transform", `scale(${1 / transform.k})`);
                    node.select("text")
                        .attr("transform", `scale(${1 / transform.k})`);
                });
                g.selectAll(".link")
                    .style("stroke-width", `${1.5 / transform.k}px`);
            }));

    g = svg.append("g");

    simulation = d3.forceSimulation(nodesArray)
        .force("link", d3.forceLink(linksArray).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("center", d3.forceCenter(width / 2, height / 2));

    // Initial setup of links and nodes
    link = createLinks(linksArray);
    node = createNodes(nodesArray);

    // Update simulation on tick
    simulation.on("tick", () => {
        link.attr("d", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = Math.sqrt(dx * dx + dy * dy);
            return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        });

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Check for initial view preference
    const initialView = localStorage.getItem('initialView');
    const viewInitData = localStorage.getItem('viewInitData');

    if (initialView) {
        // Deselect all filters first
        d3.selectAll('#filters input').property('checked', false);

        // Create initial network but don't display it yet
        svg.style("display", "none");

        // Set up initial view based on stored preference
        switch (initialView) {
            case 'values-network':
                d3.select('#filter-values').property('checked', true);
                currentView = 'network';
                svg.style("display", "block");
                break;

            case 'materials-network':
                d3.select('#filter-materials').property('checked', true);
                currentView = 'network';
                svg.style("display", "block");
                break;

            case 'materials-gallery':
                d3.select('#filter-materials').property('checked', true);
                currentView = 'gallery';
                // Set gallery button as active immediately
                document.querySelector('[data-mode="gallery"]').classList.add('active');
                document.querySelector('[data-mode="network"]').classList.remove('active');
                // Initialize gallery view and hide network immediately
                svg.style("display", "none");
                if (!galleryView) {
                    galleryView = new GalleryView("#network");
                    galleryView.initialize();
                }
                break;
        }

        // Trigger the filter change event after view is set up
        const activeFilter = document.querySelector('#filters input:checked');
        if (activeFilter) {
            const event = new Event('change');
            activeFilter.dispatchEvent(event);
        }

        // Show controls
        document.getElementById('network').classList.remove('network-hidden');
        document.getElementById('network').classList.add('network-visible');
        document.querySelectorAll('.utility-button, #filters').forEach(el => {
            el.style.display = '';
        });

        localStorage.removeItem('initialView');
        localStorage.removeItem('viewInitData');
    } else {
        // Se non c'è una vista iniziale, prova a ripristinare l'ultimo stato
        restoreState();
    }
}).catch(function (error) {
    console.error("Error loading the CSV files:", error);
});