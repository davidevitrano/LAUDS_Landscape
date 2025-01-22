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


// Function to cleanup current view
function cleanupCurrentView() {
    switch (currentView) {
        case 'network':
            d3.select("#network svg:first-child").style("display", "none");
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


// Initially hide the network and controls
document.getElementById('network').classList.add('network-hidden');
document.querySelectorAll('.utility-button, #filters').forEach(el => {
    el.style.display = 'none';
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

    // Reset global state and update visualization
    resetGlobalState();
    updateVisualization();
});

// Setup view mode buttons// Add this to the view mode button event listeners
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
                d3.select("#network svg:first-child").style("display", "block");
                currentView = 'network';
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
    });
});

const tutorialOverlay = new TutorialOverlay();

// Combine data from both CSVs
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
    const links = [];

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
                        const nodeInfo = nodesData.filter(d => d.Node == value);
                        const info = nodeInfo.length > 0 ? nodeInfo[0] : {};

                        nodes[value] = {
                            id: value,
                            group: col,
                            description: info.nodesDescription || '',
                            category: info.category || col
                        };
                    }
                    links.push({ source: d.Name, target: value });
                });
            }
        });
    });

    // Convert objects to arrays for D3
    const nodesArray = Object.values(nodes);
    const linksArray = links;

    // Create the SVG for visualization
    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select("#network").append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("background-color", "#ECECEC")
        .call(d3.zoom()
            .scaleExtent([0.7, 5])
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

    const g = svg.append("g");

    let simulation = d3.forceSimulation(nodesArray)
        .force("link", d3.forceLink(linksArray).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("center", d3.forceCenter(width / 2, height / 2));

    // Initial setup of links and nodes
    let link = createLinks(linksArray);
    let node = createNodes(nodesArray);

    // Check for initial view preference
    const initialView = localStorage.getItem('initialView');
    if (initialView) {
        setTimeout(() => {
            // Deselect all filters first
            d3.selectAll('#filters input').property('checked', false);

            // Set initial view based on stored preference
            switch (initialView) {
                case 'values-network':
                    d3.select('#filter-values').property('checked', true);
                    d3.selectAll('[data-mode]').classed('active', false);
                    d3.select('[data-mode="network"]').classed('active', true);
                    break;

                case 'materials-network':
                    d3.select('#filter-materials').property('checked', true);
                    d3.selectAll('[data-mode]').classed('active', false);
                    d3.select('[data-mode="network"]').classed('active', true);
                    break;

                case 'materials-gallery':
                    d3.select('#filter-materials').property('checked', true);
                    d3.selectAll('[data-mode]').classed('active', false);
                    d3.select('[data-mode="gallery"]').classed('active', true);
                    const galleryButton = document.querySelector('[data-mode="gallery"]');
                    if (galleryButton) {
                        galleryButton.click();
                    }
                    break;
            }

            // Trigger the filter change event
            const activeFilter = document.querySelector('#filters input:checked');
            if (activeFilter) {
                const event = new Event('change');
                activeFilter.dispatchEvent(event);
            }

            // Show the network and controls after filter is applied
            setTimeout(() => {
                document.getElementById('network').classList.remove('network-hidden');
                document.getElementById('network').classList.add('network-visible');
                document.querySelectorAll('.utility-button, #filters').forEach(el => {
                    el.style.display = '';
                });
            }, 100);

            localStorage.removeItem('initialView');
        }, 1000);
    }

    // Zoom function
    function zoomed(event) {
        g.attr("transform", event.transform);
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

    // Function to create nodes with fixed highlighting
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
            .attr("class", d => d.group === 'main' ? 'font-size-medium-small' : 'font-size-small')
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

    // Global state for managing popups and highlighting
    let globalState = {
        activeNode: null,
        isPopupOpen: false
    };

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

    // Function to create legend popup
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
            
            <h3>Network Visualisation</h3>
            <p>See how different sustainable urban production realities in Europe are connected with different values, materials, processes and how they approach knowledge sharing in their spaces. Filter the visualisation to explore and click on the different nodes for additional information.</p>

            <div class="popup-line"></div>

            <h3>Gallery Visualisation</h3>
            <p>Urban production realities do not speak only in words but also using images and their visual communication is essential to discover the photos associated with the key concepts of the research. Each concept must also be discovered in its visual side. Find out which images belong to the same manufacturer by hovering over them or by clicking on them.</p>

            <div class="popup-line"></div>

            <h3>Nearest Visualisation</h3>
            <p>Check which urban producers are closest to you or more generally where they are positioned. See how the realities are arranged more or less close to the center representing your position. This visualization is simply used to have a more interactive view of the urban production realities collected and analyzed, it absolutely does not represent the complete European panorama.</p>
        `;

        newPopup.html(popupContent);

        // Handle popup close button
        d3.select("#close-popup").on("click", () => {
            newPopup.remove();
            globalState.isPopupOpen = false;
        });

        globalState.isPopupOpen = true;
    }

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

    // Function to create popup for category nodes (remains the same)
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

    // Update simulation
    simulation.on("tick", () => {
        link.attr("d", d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = Math.sqrt(dx * dx + dy * dy);
            return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        });

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Reset global state when filters change
    function resetGlobalState() {
        globalState = {
            activeNode: null,
            isPopupOpen: false
        };
        d3.select("#popup").remove();
        removeHighlight();
    }

    // Logic to hide or show nodes based on filters
    d3.selectAll("#filters input").on("change", function () {
        // Reset global state when filters change
        resetGlobalState();

        const filters = {
            "Values": d3.select("#filter-values").property("checked"),
            "Materials": d3.select("#filter-materials").property("checked"),
            "Processes and Technologies": d3.select("#filter-processes").property("checked"),
            "Knowledge Sharing": d3.select("#filter-knowledge").property("checked")
        };

        // Hide main nodes without connections
        const filteredLinks = linksArray.filter(l => {
            return filters[l.target.group];
        });

        const connectedNodes = new Set(filteredLinks.flatMap(l => [l.source.id, l.target.id]));
        const finalNodes = nodesArray.filter(d =>
            d.group === 'main' && connectedNodes.has(d.id) ||
            d.group !== 'main' && filters[d.group]
        );

        // Get current zoom transform
        const currentTransform = d3.zoomTransform(svg.node());

        // Remove old elements
        g.selectAll(".link, .node").remove();

        // Recreate links and nodes
        link = createLinks(filteredLinks);
        node = createNodes(finalNodes);

        // Apply current zoom transform to the container
        g.attr("transform", currentTransform);

        // Apply inverse zoom to node elements to maintain their size
        g.selectAll(".node").each(function () {
            const node = d3.select(this);
            node.selectAll("circle, rect, polygon")
                .attr("transform", `scale(${1 / currentTransform.k})`);
            node.select("text")
                .attr("transform", `scale(${1 / currentTransform.k})`);
        });

        // Adjust link stroke width
        g.selectAll(".link")
            .style("stroke-width", `${1.5 / currentTransform.k}px`);

        // Reorganize the network
        simulation.nodes(finalNodes);
        simulation.force("link").links(filteredLinks);
        simulation.alpha(1).restart();
    });

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

}).catch(function (error) {
    console.error("Error loading the CSV files:", error);
});