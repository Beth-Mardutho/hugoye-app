const state = {
    totalResults: 0,
    currentPage: 1,
    from: 0,
    size: 25,
    lang: '',
    query: '',
   
    searchType: '',
   
    sortFactor: '',
    isLoading: false,
    // OpenSearch data fields
   
    author: '',



    fullText: '',

    idno: '',
    keyword: '',
    title: '',
    type: [],
};

// Base API URL
const apiUrl = "https://50fnejdk87.execute-api.us-east-1.amazonaws.com/opensearch-api-test/hugoye";

function fetchAndRenderAdvancedSearchResults() {
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

            const idno = hit._source.idno || '';
            const originURL = window.location.origin;
            let url = idno.replace('https://hugoye.bethmardutho.org', originURL) ;
            let urlHtml = url + '.html';

            resultItem.innerHTML = `
                    <a href="${urlHtml}" target="_blank" style="text-decoration: none; color: #007bff;">
                        <span class="tei-title title-analytic">${title}</span> ${typeString}
                    </a>
                    ${displayTitle && displayTitle.trim() !== '' && displayTitle !== displayTitle ? `<br/><span class="tei-title title-analytic">(${displayTitle})</span>` : ''}
                    <br/>URI: 
                    <a href="${urlHtml}" target="_blank" style="text-decoration: none; color: #007bff;">
                        <span class="tei-title title-analytic">${url}</span>
                    </a>
                    ${type && type.trim() !== '' && type !== type ? `<br/><span class="tei-title title-analytic">(${type})</span>` : ''}
                    <br/>
                    ${type}
                `;
            

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

// function trimYear(value) {
//     if (!value) return '';
//     const str = String(value);

//     // Remove last 4 characters if the string is longer than 4
//     const trimmed = str.length > 4 ? str.slice(0, -4) : str;

//     // Remove leading zeros using regex
//     return trimmed.replace(/^0+/, '');
// }

// function trimYearList(input) {
//     if (Array.isArray(input)) {
//         return input.map(trimYear);
//     } else {
//         return trimYear(input);
//     }
// }

// Reusable error handler
function handleError(containerId, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Clear previous message
    container.innerHTML = `<p>${message}</p>`;
}

// function getBrowse(series) {
//     //This defines a first page load browse, retains letter and series in state, lang
//     state.query = series; // Retain the series in state.query
//     state.series = series; // Set the series in state.series also
//     state.from = state.from || 0; // Reset for the first page if not already set
//     state.letter = state.letter || 'A'; // Default 
//     state.searchType = 'letter'; 
//     const params = {
//         searchType: 'letter',
//         q: series, // Retain the query which is the series name in the case of browse
//         letter: state.letter,
//         from: state.from,
//         size: state.size,
//         lang: state.lang,
//         series: state.series
//     };

//     // Remove empty or undefined parameters
//     const filteredBrowseParams = Object.fromEntries(
//         Object.entries(params).filter(([key, value]) => value !== '' && value !== undefined)
//     );

//     // Create URLSearchParams with filtered parameters
//     const queryParams = new URLSearchParams(filteredBrowseParams);
//     // new query parameters to url (without reloading)
//     window.history.pushState({}, '', `?${queryParams.toString()}`);

//     fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'GET' })
//         .then(response => response.json())
//         .then(data => {
//             state.totalResults = data.hits.total.value;
//             displayResultsInfo(state.totalResults);
//             displayResults(data);
//         })
//         .catch(error => {
//             handleError('search-results', 'Error fetching browse results.');
//             console.error(error);
//         });
// }

// function getPaginatedBrowse() {
//     state.query = state.query || 'cbssAuthor';  
//     state.series = state.series || state.query; // Set the series to the current query
//     const params = {
//         searchType: state.searchType,
//         q: state.query, // Retain the query which is the series name in the case of browse
//         letter: state.letter,
//         from: state.from,
//         size: state.size,
//         lang: state.lang,
//         series: state.series,
//         subject: state.cbssSubject
//     };

//     // Remove empty or undefined parameters
//     const filteredBrowseParams = Object.fromEntries(
//         Object.entries(params).filter(([key, value]) => value !== '' && value !== undefined)
//     );

//     // Create URLSearchParams with filtered parameters
//     const queryParams = new URLSearchParams(filteredBrowseParams);
//     window.history.pushState({}, '', `?${queryParams.toString()}`); // Update URL

//     fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'GET' })
//         .then(response => response.json())
//         .then(data => {
//             state.totalResults = data.hits.total.value;
//             displayResultsInfo(state.totalResults);
//             if(state.query === 'cbssAuthor' || state.series === 'Comprehensive Bibliography on Syriac Studies'){ displayCBSSAuthorResults(data); }
//             else{displayResults(data);}
//         })
//         .catch(error => {
//             handleError('search-results', 'Error fetching browse results.');
//             console.error(error);
//         });
//         // window.history.pushState({}, '', `?${queryParams.toString()}`); // Update URL

// }

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
    state.query = urlParams.get('q') || '';
    state.searchType = urlParams.get('searchType') || '';
    state.keyword = urlParams.get('keyword') || '';
    state.from = Number(urlParams.get('from')) || 0;
    state.size = Number(urlParams.get('size')) || 25;

    // Load additional filters

    state.title = urlParams.get('title') || '';
    state.author = urlParams.get('author') || '';
    state.editor = urlParams.get('editor') || '';
    state.keyword = urlParams.get('keyword') || '';
    state.sortFactor = urlParams.get('sortFactor') || 'author';
    state.fullText = urlParams.get('fullText') || '';
    state.type = urlParams.getAll('type') || [];
    if (state.keyword) {
        fetchAndRenderAdvancedSearchResults();
    }
}



// function browseAlphaMenu() {
//     const urlParams = new URLSearchParams(window.location.search);
//     state.lang = urlParams.get('lang') || 'en'; // Default to English if no language is set
//     state.letter = urlParams.get('letter') || 'a'; // Default to 'A' if no letter is set

//     const engAlphabet = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z ʾ ʿ #';
//     const syrAlphabet = 'ܐ ܒ ܓ ܕ ܗ ܘ ܙ ܚ ܛ ܝ ܟ ܠ ܡ ܢ ܣ ܥ ܦ ܩ ܪ ܫ ܬ';
//     const arAlphabet = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي';

//     // Determine the alphabet based on the selected language
//     let alphabet = engAlphabet;
//     if (state.lang === 'syr') {
//         alphabet = syrAlphabet;
//         state.letter = 'ܐ'; // Default to first Syriac letter
//     } else if (state.lang === 'ar') {
//         alphabet = arAlphabet;
//         state.letter = 'ا'; // Default to first Arabic letter
//     } 

//     // Create the menu container
//     const menuContainer = document.getElementById('abcMenu');
//     menuContainer.innerHTML = ''; // Clear previous menu

//     // Set direction for right-to-left languages
//     if (state.lang === 'syr' || state.lang === 'ar') {
//         menuContainer.setAttribute('dir', 'rtl');
//     } else {
//         menuContainer.setAttribute('dir', 'ltr');
//     }

//     // Create alphabet navigation
//     alphabet.split(' ').forEach(letter => {
//         const menuItem = document.createElement('li');
//         menuItem.classList.add('ui-menu-item');
//         menuItem.setAttribute('role', 'menuitem');
//         //items.forEach(el => el.classList.remove('selected'));
//         const menuLink = document.createElement('a');
//         menuLink.classList.add('ui-all');
//         menuLink.textContent = letter;
//         letterLowerCase = letter.toLowerCase();
//         const seriesFromPath = getSeriesFromPath(); // Get series from the current path
//         menuLink.href = `?searchType=letter&letter=${letterLowerCase}&q=${encodeURIComponent(state.query)}&size=${state.size}&lang=${state.lang}`;
        
//         // Attach event listener for letter selection
//         menuLink.addEventListener('click', (event) => {
//             event.preventDefault(); // Prevent page reload
//             state.letter = letter; // Update state
//             state.from = 0; // Reset pagination

//             state.query = state.query || state.series || seriesFromPath || 'Gazetteer to John of Ephesus’s Ecclesiastical History'; // Ensure query is set
//             const newUrlParams = new URLSearchParams({
//                 searchType: 'letter',
//                 q: state.query,
//                 letter: state.letter, 
//                 size: state.size, 
//                 lang: state.lang
//             });
//             window.history.pushState({}, '', `?${newUrlParams.toString()}`); // Update URL
//             getBrowse(state.query); // Trigger browse function
//         });

//         menuItem.appendChild(menuLink);
//         menuContainer.appendChild(menuItem);
//     });
// }

// function browseCbssAlphaMenu() {
//     const urlParams = new URLSearchParams(window.location.search);
//     state.lang = urlParams.get('lang') || 'en'; // Default to English if no language is set
//     // state.searchType = urlParams.get('searchType') || 'browse'; // Retrieve searchType from the URL
//     state.searchType = 'browse'; // Do not Retrieve searchType from the URL, set as browse
//     state.series = 'Comprehensive Bibliography on Syriac Studies'; // Set series to CBSS

//     state.query = urlParams.get('q') || 'cbssSubject'; // Retrieve query from the URL
//     const alphabets = {
//         en: 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z ʾ ʿ #',
//         rus: 'А Б В Г Д Е Ё Ж З И Й К Л М Н О П Р С Т У Ф Х Ц Ч Ш Щ Ъ Ы Ь Э Ю Я',
//         gr: 'Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω',
//         arm: 'Ա Բ Գ Դ Ե Զ Է Ը Թ Ժ Ի Լ Խ Ծ Կ Հ Ձ Ղ Ճ Մ Յ Ն Շ Ո Չ Պ Ջ Ռ Ս Վ Տ Ր Ց Ու Փ Ք Օ Ֆ',
//         he: 'א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע פ צ ק ר ש ת',
//         syr: 'ܐ ܒ ܓ ܕ ܗ ܘ ܙ ܚ ܛ ܝ ܟ ܠ ܡ ܢ ܣ ܥ ܦ ܨ ܩ ܪ ܫ ܬ',
//         ar: 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'
//     };

//     // Select the appropriate alphabet for the current language
//     const alphabet = alphabets[state.lang] || alphabets.en;
//     // Set the default letter based on the language-- 
//     if (state.lang === 'syr') {
//         state.letter =  'ܐ'; // Default to first Syriac letter
//     } else if (state.lang === 'ar') {
//         state.letter = 'ا'; // Default to first Arabic letter
//     } else if (state.lang === 'he') {
//         state.letter = 'א'; // Default to first Hebrew letter
//     } else if (state.lang === 'arm') {
//         state.letter = 'Ա'; // Default to first Armenian letter
//     } else if (state.lang === 'gr') {
//         state.letter = 'Α'; // Default to first Greek letter
//     } else if (state.lang === 'rus') {
//         state.letter = 'А';     
//     } else { state.letter = 'A'; } // Default to first English letter
//     // if (state.lang === 'rus' || state.lang === 'en') {state.letter = 'A';} else {state.letter = '';}
//     // Create the menu container
//     const menuContainer = document.getElementById('abcMenu');
//     menuContainer.innerHTML = ''; // Clear previous menu

//     // Set direction for right-to-left languages
//     const rtlLanguages = ['ar', 'syr', 'he'];
//     menuContainer.setAttribute('dir', rtlLanguages.includes(state.lang) ? 'rtl' : 'ltr');

//     // Create alphabet navigation
//     alphabet.split(' ').forEach(letter => {
        
//         const menuItem = document.createElement('li');
//         menuItem.classList.add('ui-menu-item');
//         menuItem.setAttribute('role', 'menuitem');

//         const menuLink = document.createElement('a');
//         menuLink.classList.add('ui-all');
//         menuLink.textContent = letter;
//         menuLink.href = `?searchType=browse&q=${encodeURIComponent(state.query)}&letter=${letter}&size=${state.size}&lang=${state.lang}`;

//         // Attach event listener for letter selection
//         menuLink.addEventListener('click', (event) => {
            
//             event.preventDefault(); // Prevent page reload
//             state.letter = letter; // Update state
//             state.from = 0; // Reset pagination
//             state.currentPage = 1;
//             state.searchType = 'browse'; // Set searchType to 'browse'
//             const newUrlParams = new URLSearchParams({
//                 searchType: 'browse',
//                 q: state.query || 'cbssSubject', // Default to 'cbssSubject' if query is not set
//                 size: state.size,
//                 lang: state.lang
//             });
//             if (state.letter) {
//                 newUrlParams.set('letter', state.letter);
//             }

//             window.history.pushState({}, '', `?${newUrlParams.toString()}`); // Update URL
 

//             getCBSSBrowse(); // Trigger the CBSS browse function
//         });

//         menuItem.appendChild(menuLink);
//         menuContainer.appendChild(menuItem);
//     });
// }


// function getCBSSBrowse() {
//     const urlParams = new URLSearchParams(window.location.search);

//     // Only apply defaults if no search parameters are in the URL
//     if (!urlParams.has('searchType')) {
//         state.from = 0; // Reset for the first page
//         state.letter = state.letter || 'A'; // Default letter if not already set
//         state.series = 'Comprehensive Bibliography on Syriac Studies'; // Set series to CBSS
//         state.searchType = state.searchType || 'browse'; // Set search type to 'browse'
//         state.query = state.query || 'cbssSubject'; // Set query to 'cbssSubject' by default
//     } else {
//         initializeStateFromURL();
//     }

//     // Set query parameters for url and search
//     const queryParams = new URLSearchParams(buildQueryParams());

//     window.history.pushState({}, '', `?${queryParams.toString()}`);

//     fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'GET' })
//         .then(response => response.json())
//         .then(data => {
//             state.totalResults = data.hits.total.value;
//             displayResultsInfo(state.totalResults); 
//             if (state.query === 'cbssAuthor') { displayCBSSAuthorResults(data); }
//             if (state.query === 'cbssSubject' && state.searchType === 'browse' ) { displayCBSSSubjectResults(data); }
//             if (state.searchType === 'cbssSubject') {
//             // Display the results
//             console.log("displayCBSSDocumentResults", data, state.cbssSubject);
//             displayCBSSDocumentResults(data, state.cbssSubject);
//             fetchCbssRelatedSubjects();
            
//             //Change this for infinite scrolling?
//             createSortDocumentResultButton(data);            }
//         })
//         .catch(error => {
//             handleError('search-results', 'Error fetching CBSS browse results.');
//             console.error(error);
//         });

//     updateURLFromState();
// }

// function displayCBSSSubjectResults(data) {
//     setupInfiniteScroll(); // Initialize infinite scroll
    
//     const resultsContainer = document.getElementById("cbss-subject-search-results");
//     resultsContainer.innerHTML = ''; // Clear previous results
//     const docResultsContainer = document.getElementById("document-search-results");
//     docResultsContainer.innerHTML = ''; // Clear previous results
//     const submenuResultsContainer = document.getElementById("common-subject-menu");
//     submenuResultsContainer.innerHTML = ''; // Clear previous results
//     // clearSearchResults(); // Clear previous search results
//     // Ensure aggregation data is available
//     const subjects = data.aggregations?.unique_subjects?.buckets || [];

//     // Sort subjects alphabetically (ignoring case)
//     subjects.sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()));
//     state.allCbssSubjects = subjects;

//     // Convert state.letter to lowercase for case-insensitive comparison
//     // const filteredSubjects = subjects.filter(subject => 
//     //     subject.key.trim().toLowerCase().startsWith(state.letter.toLowerCase())
//     // );
//     const filteredSubjects = subjects;
//     // Filter subjects that start with the designated letter
   
//     state.totalResults = filteredSubjects.length;
//     displayResultsInfo(state.totalResults); 

//     if (filteredSubjects.length > 0) {
//         const list = document.createElement("div"); // Create a list to display subjects
//         //list.classList.add("subject-list"); // Add a class for styling
//         // list.style.display = "flex";
//         // list.style.flexDirection = "column";
//         // list.style.alignItems = "left"; // Center the list
//         // list.style.margin = "20px auto"; // Center horizontally
//         // list.style.width = "fit-content"; // Adjust width based on content

//         filteredSubjects.forEach(subject => {
//             const listItem = document.createElement("div");
//             listItem.className = "cbss-subject-item"; // <- ADD THIS LINE
//             const link = document.createElement("a");

//             link.href = "#"; // Placeholder, will be handled by the click event
//             link.textContent = `${subject.key} `; // Display the subject name and count-- doc count inaccurate, driving me crazy, undercounting
//             link.style.textDecoration = "none"; // Style the link

//             // Attach click event to fetch CBSS records for this subject
//             link.addEventListener("click", (event) => {
//                 event.preventDefault(); // Prevent default anchor behavior
//                 state.subject = subject.key;
//                 state.cbssSubject = subject.key; // Store the selected subject in state
//                 state.letter = '';
//                 fetchCBSSRecordsBySubject(subject.key); // Fetch records for the clicked subject
//                 updateURLFromState(); // Update URL based on the current state
//             });

//             listItem.appendChild(link);
//             list.appendChild(listItem);
//         });

//         resultsContainer.appendChild(list); // Add the list to the results container
//     } else {
//         resultsContainer.innerHTML = `<p>No subjects found starting with "${state.letter}".</p>`;
//     }
// }
// // Function to fetch CBSS document entries by subject
// function fetchCBSSRecordsBySubject(subjectKey) {
//     document.querySelectorAll(".cbss-subject-item").forEach(el => el.remove());
//     const previousResultsContainer = document.getElementById("cbss-subject-search-results");
//     previousResultsContainer.innerHTML = ''; // Clear previous results
//     if (state.isLoading) return; // Prevent multiple calls
//     state.isLoading = true; 
//     state.searchType = "cbssSubject";   
//     //Not sure if this is necessary  
//     state.subject = subjectKey;
//     state.cbssSubject = subjectKey; // Store the selected subject in state
//     // Build query parameters
//     const queryParams = new URLSearchParams({
//         searchType: "cbssSubject",        
//         subject: state.cbssSubject, 
//         size: state.size, 
//         from: state.from,
//         sort: state.sortFactor
//     });
//     if(state.currentPage === 1){
//         fetchCbssRelatedSubjects();
//     }
//     // Fetch data from the API
//     fetch(`${apiUrl}?${queryParams.toString()}`, { method: 'GET' })
//         .then(response => {
//             if (!response.ok) {
//                 throw new Error(`HTTP error! Status: ${response.status}`);
//             }
//             return response.json();
//         })
//         .then(data => {
//             state.totalResults = data.hits.total.value;
//             //change this for infinite scrolling?
//             displayResultsInfo(state.totalResults);
//             // Display the results
//             displayCBSSDocumentResults(data, subjectKey);
//             //Change this for infinite scrolling?
//             createSortDocumentResultButton(data);
//             state.isLoading = false;
//         })
//         .catch(error => {
//             console.error('Error fetching CBSS records:', error);
//             handleError('search-results', 'Error fetching CBSS records.');
//             state.isLoading = false;
//         });
        
//     updateURLFromState(); // Update URL based on the current state

// }
// // These queries should not be reflected in the URL
// function fetchCbssRelatedSubjects() {
//         // Build related subject query parameters //don't need to do this for every subject search
//         const queryParamsRelSubject = new URLSearchParams({
//             searchType: "cbssRelSubject",        
//             subject: state.cbssSubject
//         });  
    
//         fetch(`${apiUrl}?${queryParamsRelSubject.toString()}`, { method: 'GET' })  
//             .then(response => {
//                 if (!response.ok) {
//                     throw new Error(`HTTP error! Status: ${response.status}`);
//                 }
//                 return response.json();
//             })
//             .then(data => {
//                 // state.totalResults = data.hits.total.value;
//                 // Display the results
//                 displayCBSSSubjectsinCommonResults(data, state.cbssSubject);
//             })
//             .catch(error => {
//                 console.error('Error fetching CBSS related subject records:', error);
//                 handleError('search-results', 'Error fetching CBSS records.');
    
//             });  
// }
// // Function to display related subjects in common: not reflected in URL
// function displayCBSSSubjectsinCommonResults(data, selectedSubject) {
//     const menuContainer = document.getElementById("common-subject-menu"); // Fix incorrect ID
//     menuContainer.innerHTML = ""; // Clear existing menu
    
//     console.log("function: displayCBSSSubjectsinCommonResults", data, selectedSubject);
//     if (!data.aggregations || !data.aggregations.unique_subjects) {
//         console.error("No subjects found in aggregation.");
//         menuContainer.innerHTML = `<p>No related subjects found.</p>`;
//         return;
//     }

//     const subjects = data.aggregations.unique_subjects.buckets || [];

//     // Create a scrollable div instead of <select>
//     const scrollContainer = document.createElement("div");
//     scrollContainer.style.maxHeight = "400px"; // Limit height to allow scrolling
//     scrollContainer.style.overflowY = "auto"; // Enable scrolling
//     const subjectHeading = document.createElement("h3");
//     subjectHeading.textContent = `Related Subjects:`;
//     subjectHeading.style.marginBottom = "10px"; // Adjust as needed
//     menuContainer.appendChild(subjectHeading);
//     scrollContainer.style.position = "sticky";
//     scrollContainer.style.top = "0";
//     scrollContainer.style.zIndex = "1";
//     scrollContainer.appendChild(subjectHeading);   
//     subjects.forEach(subject => {
//         if (!selectedSubject.split(", ").includes(subject.key)) {
//             const button = document.createElement("button");
//             // button.textContent = `${subject.key} (${subject.doc_count})`;
//             button.textContent = `${subject.key}`;
//             button.style.display = "block";
//             button.style.width = "100%";
//             button.style.padding = "5px";
//             button.style.border = "none";
//             button.style.background = "#f4f4f4";
//             button.style.cursor = "pointer";
//             button.style.color = "#337ab7";

//             button.onclick = () => {
//                 state.currentPage = 1;
//                 state.from = 0;
//                 fetchCBSSRecordsBySubject(subject.key+", "+selectedSubject);
//             };

//             scrollContainer.appendChild(button);
//         }
//     });


//     menuContainer.appendChild(scrollContainer);
// }


// // Function to display CBSS document results
// function displayCBSSDocumentResults(data, subjectKey) {
//     // Split subjects if there are multiple
//     console.log("within displayCBSSDocumentResults function", data, subjectKey);
//     let subjectsArray = subjectKey.split(",").map(s => s.trim());
//     const previousResultsContainer = document.getElementById("search-results");
//     previousResultsContainer.innerHTML = ''; // Clear previous results

//     const resultsContainer = document.getElementById("document-search-results");
//     if (state.currentPage === 0 || state.currentPage === 1) {
//         resultsContainer.innerHTML = ''; // Clear previous results only on first load
//         const subjectHeader = document.createElement("h3");
//         subjectHeader.textContent = subjectsArray.length > 1 ? "Selected Subjects:" : "Selected Subject:";
//         subjectHeader.style.marginBottom = "30px";
//         subjectHeader.style.fontWeight = "bold";
//         resultsContainer.appendChild(subjectHeader);
//         // Create container for subject tags
//         const subjectContainer = document.createElement("div");
//         subjectContainer.style.marginBottom = "30px"; 

//         subjectsArray.forEach(subject => {
//             // Create the grey box for each subject
//             const subjectTag = document.createElement("div");
//             subjectTag.classList.add("subject-tag");
//             subjectTag.style.display = "inline-block";
//             subjectTag.style.backgroundColor = "#e0e0e0";
//             subjectTag.style.padding = "8px 16px";
//             subjectTag.style.margin = "8px";
//             subjectTag.style.borderRadius = "8px";
//             subjectTag.style.fontSize = "16px";
//             subjectTag.style.cursor = "pointer";
//             subjectTag.style.position = "relative";

//             // Add subject name
//             const subjectText = document.createElement("span");
//             subjectText.textContent = subject;

//             // Create the remove button (❌)
            
//             const removeButton = document.createElement("span");
//             removeButton.textContent = " ❌";
//             removeButton.style.marginLeft = "12px";
//             removeButton.style.color = "#d9534f";
//             removeButton.style.cursor = "pointer";
//             removeButton.style.fontSize = "12px";

    

//             // Attach event listener to remove subject
//             removeButton.addEventListener("click", (event) => {
//                 event.stopPropagation(); // Prevent triggering any parent click events

//                 // Remove subject from the array
//                 subjectsArray = subjectsArray.filter(s => s !== subject);

//                 // Update state & trigger new search
//                 state.cbssSubject = subjectsArray.join(", ");
//                 if (subjectsArray.length > 0) {
//                     state.currentPage = 1;
//                     state.from = 0;
//                     fetchCBSSRecordsBySubject(state.cbssSubject);
//                 } else {
//                     resultsContainer.innerHTML = "<p>No subjects selected.</p>";
//                 }
//             });

            
//             // Append elements to the tag
//             subjectTag.appendChild(subjectText);
//             if(subjectsArray.length > 1){
//                 subjectTag.appendChild(removeButton);
//             } 
//             subjectContainer.appendChild(subjectTag);
//         });

//         // Add the subject tags container to the results container
//         resultsContainer.appendChild(subjectContainer);
//     }       
//     if (data.hits && data.hits.hits.length > 0) {
        
//         // Extract and sort the results by author name
//         const sortedHits = sortDocumentResultRequest(data, state.sortFactor);

 
//         sortedHits.forEach(hit => {
//             const resultItem = document.createElement("div");
//             resultItem.classList.add("result-item");
//             resultItem.style.marginBottom = "15px"; // Add spacing between items
        
//             // Extract relevant fields from the hit source
//             let subjects = hit._source.subject || [];
//             const citation = hit._source.citation || "No Citation";
//             const idno = hit._source.idno || "#";
        
//             // Ensure subjects are formatted correctly as an array
//             if (!Array.isArray(subjects)) {
//                 subjects = subjects.split(",").map(s => s.trim());
//             }
        
//             // Create a container for the subject links
//             const docSubjectContainer = document.createElement("p");
//             const docSubjectHeading = document.createElement("h4");
//             docSubjectHeading.textContent = "Subjects:";
//             docSubjectContainer.textContent = "Subjects: ";
//             //docSubjectContainer.appendChild(docSubjectHeading);
//             docSubjectContainer.style.marginBottom = "30px"; // Add spacing below subjects
        
//             // Create a comma-separated list of clickable subject links
//             const subjectLinks = subjects.map(subject => {
//                 const subjectLink = document.createElement("a");
//                 subjectLink.textContent = subject;
//                 subjectLink.href = "#"; // Prevents full page reload
//                 // subjectLink.style.color = "#007bff"; // Makes text blue
//                 subjectLink.style.textDecoration = "none"; // Removes underline
//                 subjectLink.style.cursor = "pointer"; // Shows pointer on hover
        
//                 // Attach event listener to trigger subject search
//                 subjectLink.addEventListener("click", (event) => {
//                     event.preventDefault(); // Prevents default anchor behavior
//                     state.currentPage = 1;
//                     state.from = 0;
//                     fetchCBSSRecordsBySubject(subject);
//                 });
        
//                 return subjectLink;
//             });
        
//             // Append subject links with a comma separator
//             subjectLinks.forEach((link, index) => {
//                 docSubjectContainer.appendChild(link);
//                 if (index < subjectLinks.length - 1) {
//                     docSubjectContainer.appendChild(document.createTextNode(", ")); // Add comma separator
//                 }
//             });
        
//             // Create clickable URI
//             const uri = idno !== "#" ? `<a href="${idno}" target="_blank">${idno}</a>` : "";
        
//             // Add result details
//             resultItem.innerHTML = `
//                 <div>
//                     <p><strong>${citation}</strong><br/>URI: ${uri}</p>
//                 </div>
//             `;
        
//             // Append subjects to result item
//             resultItem.appendChild(docSubjectContainer);
        
//             // Append result item to the results container
//             resultsContainer.appendChild(resultItem);
//         });
//         state.isLoading = false; // Allow more requests

//     } else {
//         if (state.currentPage === 0) {
//             resultsContainer.innerHTML = '<p>No records found for the selected subject.</p>';
//         }
//     }
// }
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
// Function to explain search hits based on the query letter for CSBBAUTHOR browse
function explainSearchHit(hit, queryLetter) {
    if (state.query !== 'cbssAuthor' ) {
        return ''; // Only explain if searchType is 'letter'
    } 
  const authors = hit._source.author || [];
  const matchingLastNames = authors
    .map(author => author.split(' ').slice(0, -1).join(' ')) // Remove last word
    .filter(lastName => lastName.toLowerCase().startsWith(queryLetter.toLowerCase()));

  if (matchingLastNames.length > 0) {
    return `Relevant author(s): ${matchingLastNames.join(', ')}`;
  }

  return '';
}

//Winona's styling implementation with explanation for letter search results
function displayCBSSAuthorResults(data) {
    const resultsContainer = document.getElementById("search-results");
          resultsContainer.innerHTML = ''; // Clear previous results
    
    //Add selected badge here? 
    const items = document.querySelectorAll('.ui-menu-item');
    //On initial load add badge to first letter if no other letter is selected. 
    // Check if any item has the 'selected' class
    const anyItemSelected = Array.from(items).some(item => 
      item.classList.contains('badge')
    );
  
    // If no item is selected, add the class to the first one
    if (!anyItemSelected && items.length > 0) {
      items[0].classList.add('badge');
    }
    
    //Add class badge to selected letter
    items.forEach(item => {
      item.addEventListener('click', () => {
        // Remove 'selected' class from all items
        items.forEach(el => el.classList.remove('badge'));

        // Add 'selected' class to the clicked item
        item.classList.add('badge');
      });
      
    });
    
    if (data.hits && data.hits.hits.length > 0) {
        data.hits.hits.forEach(hit => {
            const resultItem = document.createElement("div");
            const bdiElement = document.createElement("bdi");
            resultItem.classList.add("result-item");
            resultItem.style.marginBottom = "15px"; // Add spacing between items
            
            // Extract the title, prologue, and idno fields from the response
            const title = cleanDisplayData(hit._source.displayTitleEnglish || '');

            const citation = hit._source.citation || ' ';
            const type = hit._source.type || '';
            
            const explanation = explainSearchHit(hit, state.letter);
            
            const typeString = type ? ` (${type}) `: '';
            const prologue = hit._source.prologue || ' ';
            const idno = hit._source.idno || ''; // Fallback if no idno
            // Construct the URL using the idno field
            const url = idno ? `${idno}`: '#';
            
            // Populate the result item with the link and details
            bdiElement.innerHTML = `
                <a href="${url}" target="_blank"  ">
                    <span class="tei-title title-analytic"><i>${title}</i></span>
                </a>
                <p>${citation}</p>
                URI: 
                <a href="${url}" target="_blank"  ">
                    <span class="tei-title title-analytic">${url}</span>
                </a>
                ${explanation ? `<p>${explanation}</p><br/>` : ''}
              `;
            resultItem.appendChild(bdiElement);
            resultsContainer.appendChild(resultItem);
        });
    } else {
        resultsContainer.innerHTML = '<p>No results found.</p>';
    }
}
//Advanced Search
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
    }
    if(document.getElementById('document-search-results') && state.searchType === 'cbssSubject' ){
        setupInfiniteScroll();
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

// Infinite Scroll
// Function to load more results on scroll

function setupInfiniteScroll() {
    window.addEventListener("scroll", () => {

        if (state.isLoading || state.searchType != 'cbssSubject') return;  // Prevent excessive requests
       
        const scrollPosition = window.innerHeight + window.scrollY;
        const pageHeight = document.documentElement.scrollHeight;

        if (scrollPosition >= pageHeight - 200) { // Trigger when near bottom
            state.currentPage++;
            state.from = (state.currentPage - 1) * state.size;
 
            // Ensure we are not fetching beyond the total results
            if (state.totalResults > state.from) {
                fetchCBSSRecordsBySubject(state.cbssSubject);
            }
        }
    });
}
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

