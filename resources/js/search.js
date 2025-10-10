const state = {
    totalResults: 0,
    currentPage: 1,
    from: 0,
    size: 25,
    lang: '',

   
    searchType: '',
   
    sortFactor: '',
    isLoading: false,
    // OpenSearch data fields
   
    author: '',
    fullText: '',
    query: '',
    keyword: '',

    idno: '',
    title: '',
    type: [],
};

// Base API URL
const apiUrl = "https://50fnejdk87.execute-api.us-east-1.amazonaws.com/opensearch-api-test/hugoye";

function fetchAndRenderAdvancedSearchResults() {
    if (state.isLoading) return;
    state.isLoading = true;

    const queryParams = new URLSearchParams(buildQueryParams());
    const countQueryParams = new URLSearchParams(queryParams);
    countQueryParams.set("searchType", "count");

    fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'GET' })
        .then(response => response.json())
        .then(data => {
            clearSearchResults();

            const defaultHitCount = data.hits?.total?.value || 0;

            // If default results hit the 10k cap, get true count
            if (defaultHitCount === 10000) {
                fetch(`${apiUrl}?${countQueryParams.toString()}`, { method: 'GET' })
                    .then(countResponse => countResponse.json())
                    .then(countData => {
                        state.totalResults = countData.count || 10000;
                        displayResultsInfo(state.totalResults);
                        displayResults(data);
                    })
                    .catch(error => {
                        console.warn("Count query failed, falling back to capped result count.");
                        state.totalResults = defaultHitCount;
                        displayResultsInfo(state.totalResults);
                        displayResults(data);
                    });
            } else {
                // Use default count if under 10k
                state.totalResults = defaultHitCount;
                displayResultsInfo(state.totalResults);
                displayResults(data);
            }

            if (state.totalResults > state.size) {
                renderPagination(state.totalResults, state.size, state.currentPage, changePage);
            }
        })
        .catch(error => {
            handleError('search-results', 'Error fetching search results.');
            console.error(error);
        })
        .finally(() => {
        state.isLoading = false; 
        window.history.pushState({}, '', `?${queryParams}`);
        });
}



// Display search results

function displayResults(data) {
    clearSearchResults(); // Clear previous results

    const totalResults = data.hits.total.value || 0;
    const resultsContainer = document.getElementById("search-results");
    resultsContainer.innerHTML = '';

    // Show/hide the letter badge menu based on result count
    const items = document.querySelectorAll('.ui-menu-item');
    
    if (document.getElementById("toggleSearchForm")) {
        const toggleButton = document.getElementById("toggleSearchForm");
        const searchFormContainer = document.getElementById("advancedSearch");

        toggleButton.style.display = "inline-block";
        searchFormContainer.style.display = "none";
        toggleButton.textContent = "Show Search";
    }

    if (data.hits && data.hits.hits.length > 0) {
        data.hits.hits.forEach(hit => {
            const resultItem = document.createElement("div");
            resultItem.classList.add("result-item");
            resultItem.style.marginBottom = "15px";
            const displayTitle = cleanDisplayData(hit._source.displayTitleEnglish || '');
            const type = hit._source.type || '';
            typeString = '';
            const title = displayTitle || 'No title available';
            const author = Array.isArray(hit._source.author)
                ? hit._source.author.join(", ")
                : hit._source.author || '';

                console.log("Author: ", author);
            if (type && type.trim() !== '') {
                typeString = `<span style="font-style: italic; color: #555;">[${type}]</span>`;
            }
            if (author && author.trim() !== '' && author !== author) {
                typeString += `<br/><span style="font-weight: bold; color: #333;">by ${author}</span>`;
            }
            const idno = hit._source.idno || '';
            const originURL = window.location.origin;
            let url = idno.replace('https://hugoye.bethmardutho.org', originURL) ;
            let urlHtml = url + '.html';
            const hasAuthor = typeof author === 'string' && author.trim().length > 0;
            const hasType  = typeof type === 'string' && type.trim().length > 0;

            resultItem.innerHTML = `
                    <a href="${urlHtml}" target="_blank" style="text-decoration: none; color: #007bff;">
                        <span class="tei-title title-analytic">${title}</span> 
                    </a>
            ${hasType ? `<br/><span class="tei-title title-analytic">(${type})</span>` : ''}
            ${hasAuthor ? `<br/><span class="tei-title title-analytic">by ${author}</span>` : ''}
         `;


            // resultItem.innerHTML = `
            //         <a href="${urlHtml}" target="_blank" style="text-decoration: none; color: #007bff;">
            //             <span class="tei-title title-analytic">${title}</span> ${typeString}
            //         </a>
            //         <br/>URI: 
            //         <a href="${urlHtml}" target="_blank" style="text-decoration: none; color: #007bff;">
            //             <span class="tei-title title-analytic">${url}</span>
            //         </a>
            //         ${type && type.trim() !== '' && type !== type ? `<br/><span class="tei-title title-analytic">(${type})</span>` : ''}
            //         <br/>
            //         ${author?.trim() && `<span>by ${author}</span>`}
            //         <br/>
            //         ${type}
            //     `;
            

            resultsContainer.appendChild(resultItem);
        });
    } else {
        resultsContainer.innerHTML = '<p>No results found.</p>';
    }
}
function cleanDisplayData(entryValue) {
  return entryValue
    .replace(/^«+/, '')    // Remove leading «
    .replace(/»+$/, '')    // Remove trailing »
    .replace(/,+\s*$/, '')  // Remove trailing commas and optional whitespace
    .trim(); // Trim leading and trailing whitespace
}

// Reusable error handler
function handleError(containerId, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Clear previous message
    container.innerHTML = `<p>${message}</p>`;
}

function displayResultsInfo(totalResults) {
    const infoContainer = document.getElementById('search-info');
    // Clear previous browse info and pagination
    infoContainer.innerHTML = '';
    infoContainer.innerHTML = `
        <br/>
        <p>Total Results: ${totalResults}</p>
    `;
    
    const paginationContainers = document.getElementsByClassName('searchPagination');
    Array.from(paginationContainers).forEach(container => {
        container.innerHTML = ''; // Clear existing buttons
    });
    if (totalResults > state.size ) {
        renderPagination(totalResults, state.size, state.currentPage, changePage);
    } 
}

function initializeStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Set default values if the parameter is missing
    state.lang = urlParams.get('lang') || 'en';
    state.query = urlParams.get('q') || urlParams.get('keyword') || '';
    state.searchType = urlParams.get('searchType') || '';
    state.from = Number(urlParams.get('from')) || 0;
    state.size = Number(urlParams.get('size')) || 25;

    // Load additional filters

    state.title = urlParams.get('title') || '';
    state.author = urlParams.get('author') || '';
    state.keyword = urlParams.get('keyword') || '';
    state.sortFactor = urlParams.get('sortFactor') || 'author';
    state.fullText = urlParams.get('fullText') || '';
    state.type = urlParams.getAll('type') || [];
    if (state.keyword) {
        fetchAndRenderAdvancedSearchResults();
    }
}

function clearPaginationContainers() {
    const paginationContainers = document.getElementsByClassName('searchPagination');
    Array.from(paginationContainers).forEach(container => {
        container.innerHTML = ''; // Clear existing buttons
    });
}
function createSortDocumentResultButton(data) {
        clearPaginationContainers();
        // Create a Sort Button
        const container = document.getElementById('sort-button-container');
        container.innerHTML = ''; // ✅ Prevent multiple buttons
 
        const sortButton = document.createElement("button");
        sortButton.textContent = "Sort by Date";
        sortButton.style.display = "block";
        sortButton.style.padding = "8px 16px";
        sortButton.style.fontSize = "16px";
        sortButton.style.border = "none";
        sortButton.style.cursor = "pointer";
        sortButton.style.borderRadius = "8px";
    
        // Attach sorting event listener
        sortButton.addEventListener("click", function () {
            state.from = 0;
            state.currentPage = 1;
            state.sortFactor = "date";
            fetchCBSSRecordsBySubject(state.cbssSubject);
            // displayCBSSDocumentResults(data, state.cbssSubject);
        });
    
        container.appendChild(sortButton);

}

function sortDocumentResultRequest(data, factor) {
    const sortedHits = data.hits.hits.sort((a, b) => {
        if (factor === "author"|| !factor) {
        const authorA = Array.isArray(a._source.author)
            ? a._source.author.join(", ")
            : a._source.author || "No Author";
        const authorB = Array.isArray(b._source.author)
            ? b._source.author.join(", ")
            : b._source.author || "No Author";

        // Convert to lowercase for case-insensitive comparison
        return authorA.toLowerCase().localeCompare(authorB.toLowerCase(

        ));
    } else if (factor === "title") {
        const titleA = a._source.title || "No Title";
        const titleB = b._source.title || "No Title";
        return titleA.toLowerCase().localeCompare(titleB.toLowerCase());
    } else if (factor === "date") {  

        // Convert date strings to actual Date objects (assuming ISO or YYYY-MM-DD format)
        const dateA = a._source.cbssPubDateStart ? new Date(a._source.cbssPubDateStart) : new Date(0);
        const dateB = b._source.cbssPubDateStart ? new Date(b._source.cbssPubDateStart) : new Date(0);

        return dateA - dateB; // Sort ascending (earliest first)
    }
    });
    return sortedHits;
}



//Advanced Search
function clearUrl() {

    setTimeout(() => {
      // 1) Reset your app state
      resetState();              // you already have this function
      // 2) Clear UI
      clearSearchResults();
      clearPaginationContainers?.();
      const info = document.getElementById('search-info');
      if (info) info.innerHTML = '';

      // 3) Remove query params from the URL (no new history entry)
      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      history.replaceState({}, '', baseUrl);

    }, 0);

}
// Handle form submission
document.addEventListener('DOMContentLoaded', () => {
    initializeStateFromURL();
    
    if(document.getElementById('advancedSearch')){
        const advancedSearchForm = document.getElementById('advancedSearch');

        advancedSearchForm.addEventListener('submit', function (event) {
            event.preventDefault(); // Prevent the default form submission behavior (page reload)
            updateStateFromForm(this); // Update state with form data
            fetchAndRenderAdvancedSearchResults(); 
        });
        advancedSearchForm.addEventListener('reset', function (event) {
            setTimeout(() => {
                clearUrl();
            }, 0);
        });
    }

    // Handle back/forward navigation for search.html
    if (window.location.pathname.includes('search.html')) {
        window.addEventListener('popstate', () => {
            console.log('Back/forward on search page — reloading search.');
            runSearch();
        });
    }
});
// Function set in search.html files to run search on page load
function runSearch() {
    // Initialize state from existing URL parameters
    initializeStateFromURL();
    // Fetch and render search results if URL search parameters are present
    if(window.location.search){
        
        const urlParams = new URLSearchParams(window.location.search);
        console.log("Setting seach fields from URL Params: ", urlParams);
        for (const [key, value] of urlParams) {
            const field = document.getElementById(key) || document.querySelector(`input[name="${key}"]`) || document.querySelector(`select[name="${key}"]`);
            if (field) {
                field.value = value;
            }
        }
        fetchAndRenderAdvancedSearchResults();
    }
}


// Helper function to get form data and update state
function updateStateFromForm(form) {
    const formData = new FormData(form);

    // Map form inputs to state variables
    state.fullText = formData.get('fullText') || '';

    state.type = formData.getAll('type'); // Get all selected type values, necessary for cbss advanced search only
    state.from = 0; // Reset pagination
    state.keyword = formData.get('keyword') || '';

    state.title = formData.get('title') || '';
    state.author = formData.get('author') || '';
    state.idno = formData.get('idnoText') || '';
}

// Build the API query based on state
function buildQueryParams() {
    const params = {
        from: state.from,
        size: state.size,
        sort: state.sortFactor,

        q: state.query || state.keyword || '',
        author: state.author,
        fullText: state.fullText,
        idno: state.idno,
        title: state.title,
        type: state.type.join(','), // Join array elements with commas for query string
        keyword: state.keyword,
 
    };

    // Filter out empty or undefined parameters
    return Object.fromEntries(Object.entries(params).filter(([key, value]) => value !== '' && value !== undefined));
}
//NavBar
document.querySelector(".navbar-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const keyword = formData.get('q') || formData.get('fullText') || formData.get('keyword') || '';
    const lang = state.lang || 'en'; // Default language if not already in state

    // Build URL to redirect to search.html with query parameters
    const queryParams = new URLSearchParams({
        keyword: keyword,
        lang: lang
    });

    const currentDir = window.location.pathname.replace(/\/[^\/]*$/, '/');
    // Redirect to search.html with the params
    window.location.href = `${currentDir}search.html?${queryParams.toString()}`;
});

// Helper function to reset the state to its default values
function resetState() {
    state.from = 0;
    state.size = 25;
    state.query = '';
    state.sortFactor = '';
    state.isLoading = false;
    state.totalResults = 0;
    state.currentPage = 1;

    state.lang = 'en';
    state.keyword = '';

    state.fullText = '';
    state.type = [];
    state.title = '';
    state.author = '';
    state.idno = '';
   

}
// Toggle Advanced Search Form
// Function to toggle the display of the advanced search form
document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("toggleSearchForm")) {
        const toggleButton = document.getElementById("toggleSearchForm");
            const searchFormContainer = document.getElementById("advancedSearch");

            // Toggle the display of the advanced search form
            toggleButton.addEventListener("click", function () {
                if (searchFormContainer.style.display === "none" || searchFormContainer.style.display === "") {
                    searchFormContainer.style.display = "block";
                    toggleButton.textContent = "Hide Search";
                } else {
                    searchFormContainer.style.display = "none";
                    toggleButton.textContent = "Show Search";
                }
            });
    }
    
});

//Pagination
// Update state and fetch results for a specific page
function changePage(page) {
    state.currentPage = page;
    state.from = (page - 1) * state.size;
    document.getElementById('search-info')?.scrollIntoView({ behavior: 'smooth' });
    fetchAndRenderAdvancedSearchResults();
}

// Render pagination buttons
function renderPagination(totalResults, resultsPerPage, currentPage, onPageChange) {
    const totalPages = Math.ceil(totalResults / resultsPerPage);
    const paginationContainers = document.getElementsByClassName('searchPagination'); // Select all matching elements

    const maxPageNumbers = 5; // Max page buttons

    let startPage = Math.max(1, currentPage - Math.floor(maxPageNumbers / 2));
    let endPage = Math.min(totalPages, startPage + maxPageNumbers - 1);

    if (endPage - startPage + 1 < maxPageNumbers) {
        startPage = Math.max(1, endPage - maxPageNumbers + 1);
    }

    // Clear and populate each pagination container
    Array.from(paginationContainers).forEach(container => {
        container.innerHTML = ''; // Clear existing buttons

        for (let page = startPage; page <= endPage; page++) {
            const pageButton = createPaginationButton(page, () => onPageChange(page));
            if (page === currentPage) {
                pageButton.classList.add('active');
            }
            container.appendChild(pageButton);
        }
    });
}

// Create a pagination button
function createPaginationButton(text, onClick) {
    const button = document.createElement('button');
    button.type = 'button';  
    //btn btn-default
    button.classList.add('btn');
    button.classList.add('btn-default');
    button.textContent = text;
    button.onclick = onClick;
    return button;
}

function clearSearchResults() {
    const resultsContainer = document.getElementById("search-results");
    if (resultsContainer) resultsContainer.innerHTML = '';
    
}
function updateURLFromSearchFields() {
    const params = new URLSearchParams();

    // Loop over all input and select elements with a name
    document.querySelectorAll('input[name], select[name]').forEach(field => {
        if (field.value && field.value.trim() !== '') {
            params.set(field.name, field.value);
        }
    });

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
}
function updateURLFromState() {
    const queryParams = new URLSearchParams(buildQueryParams());
    const newUrl = `${window.location.pathname}?${queryParams.toString()}`;
    window.history.pushState({}, '', newUrl);
}
function populateFieldsFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    for (const [key, value] of urlParams) {
        const field = document.getElementById(key) || document.querySelector(`input[name="${key}"]`) || document.querySelector(`select[name="${key}"]`);
        if (field) {
            field.value = value;
        }
    }
}