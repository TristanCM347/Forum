import { DEFAULT_PROFILE_PICTURE_URL } from './config.js';
import { fileToDataUrl, noAuthAPICall, authAPICall } from './helpers.js';
import * as UI from './uiElements.js';

let intervalId = null; 
let isHeartButtonClicked = false;
let isWatchButtonClicked = false;
let lastHeight = 0;

///////////////////////////////////////////////////////////////////////
                        //// FUNCTIONS ////
///////////////////////////////////////////////////////////////////////

/**
 * Starts the polling process for watched threads.
 * It calls pollWatchedThreads immediately to start the process, and then
 * sets up an interval to repeatedly call pollWatchedThreads every 10 seconds,
 * allowing for continuous monitoring of updates.
 */
const startPolling = () => {
    pollWatchedThreads();
    intervalId = setInterval(() => {
        pollWatchedThreads();
    }, 10000); 
};

/**
 * Stops the polling process for watched threads.
 * If polling is currently active, identified by a non-null intervalId,
 * this function clears the interval, stopping the periodic polling, and
 * resets the intervalId to null.
 */
const stopPolling = () => {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
};

/**
 * Blurs every screen and adds an error popup with a custom message.
 * @param {string} errorMessage - The message to dissplay in the error popup.
 */
const showErrorPopUp = (errorMessage) => {
    // blur everything else
    UI.screens.forEach(screen => {
        screen.style.filter = 'blur(5px)';
    });
    UI.errorPopUp.style.display = 'block';
    document.querySelector('#error-popup p').textContent = errorMessage;
}

/**
 * Changes the like button to a "liked" state.
 */
const likeLikeButton = () => {
    isHeartButtonClicked = true;
    UI.heartButtonIcon.querySelector('path').setAttribute('fill', 'red');
}

/**
 * Reverts the like button back to an "unliked" state.
 */
const unlikeLikeButton = () => {
    isHeartButtonClicked = false;
    UI.heartButtonIcon.querySelector('path').setAttribute('fill', 'none');
}

/**
 * Marks the watch button as "watched" by changing the visual state.
 */
const watchWatchButton = () => {
    isWatchButtonClicked = true;
    let lines = UI.watchButtonIcon.querySelectorAll('line');
    lines.forEach(line => line.setAttribute('stroke-width', '0'));
}

/**
 * Reverts the watch button back to an "unwatched" state.
 */
const unwatchWatchButton = () => {
    isWatchButtonClicked = false;
    let lines = UI.watchButtonIcon.querySelectorAll('line');
    lines.forEach(line => line.setAttribute('stroke-width', '2'));
}

/**
 * Unhides all edited comments in a thread thaat were previously hidden.
 */
const unhideComments = () => {
    const comments = UI.threadComments.querySelectorAll('.thread-comment-box');
    comments.forEach(comment => {
        // Find all child elements within the current comment that have the attribute data-hidden="true"
        if (comment.getAttribute('data-hidden') === 'true') {
            comment.style.display = "block";
        }
    });
}

/**
 * Determines whether a gven user can modify a thread based on their role or ownership.
 * This function checks if the user is the creator of the thread or an admin.
 * 
 * @param {number} threadId - The ID of the thread being checked.
 * @param {number} creatorId - The user ID of the thread's creator.
 * @param {number} userId - The user ID of the current user attempting to make changes.
 * @returns {Promise<boolean>} A promise that rresolves to true if the user can change the thread, otherwise false.
 */
const canUserChangeThread = (threadId, creatorId, userId) => {

    return new Promise((resolve, reject) => {
        const isCreator = creatorId === userId;
        const token = localStorage.getItem('token');
  
        authAPICall('user', 'GET', token, undefined, `userId=${userId}`)
            .then(userData => {
                const isAdmin = userData.admin;
                if (isCreator || isAdmin) {
                    resolve(true);
                } else {
                    resolve(false); 
                }
            })
            .catch(error => {
                showErrorPopUp(error);
                reject(error); 
            });
    });
};

/**
 * Displays a reply to a comment in the DOM. This can be used for both adding a new reply and editing an existing one.
 *
 * @param {number|null} parentCommentId - The ID of thee parent comment to which this reply is attached. Can be null for top-level comments.
 * @param {number|null} commentBeforeId - The ID of the comment before which the new reply should be inserted. Null if appending at the end.
 * @param {string} content - The text content of the comment or reply.
 * @param {boolean} editing 
 */
const displayCommentReply = (parentCommentId, commentBeforeId, content, editing) => {
    UI.replyBox.setAttribute('data-editing', editing);
    UI.replyBox.setAttribute('data-comment-id', commentBeforeId);
    UI.threadCommentInput.value = content;
    UI.replyBox.setAttribute('data-parent-comment-id', parentCommentId);
    
    // now we find the parent so we can correctly apply indenting
    if (parentCommentId === null) {
        UI.replyBox.style.paddingLeft = '0px';
    } else {
        let parentComment;
        for (let i = 0; i < UI.threadComments.children.length; i++) {
            let child = UI.threadComments.children[i];
            // Check if the child has the 'data-comment-id' attribute and if it matches parentCommentId
            
            if (child.getAttribute('data-comment-id') === String(parentCommentId) && child.classList.contains('thread-comment-box')) {
                parentComment = child;
            }
        }
        // find margin of parentComment and add 10px
        const indentStr = parentComment.style.marginLeft.slice(0, -2);
        let indent = parseInt(indentStr, 10);
        indent += 10;
        UI.replyBox.style.paddingLeft = `${indent}px`;
    }

    // now insert into DOM
    if (commentBeforeId === null) {
        UI.threadComments.prepend(UI.replyBox);
    } else {
        let commentBefore;
        for (let i = 0; i < UI.threadComments.children.length; i++) {
            let child = UI.threadComments.children[i];
            // Check if the child has the 'data-comment-id' attribute and if it matches parentCommentId
            
            if (child.getAttribute('data-comment-id') === String(commentBeforeId) && child.classList.contains('thread-comment-box')) {
                // The child element has a matching data-comment-id attribute
                commentBefore = child;
            }
        }

        if (commentBefore.nextSibling) {
            UI.threadComments.insertBefore(UI.replyBox, commentBefore.nextSibling);
        } else {
            // If targetElement is the last child, append newElement to the parent
            UI.threadComments.appendChild(UI.replyBox);
        }
    }
}

/**
 * Displays a single comment in the DOM, indenting based on its level in a hierarchecal comment structure.
 *
 * @param {number} commentId - The unique ID of the comment.
 * @param {number} parentCommentId - The ID of the parent comment, for nesting purposes.
 * @param {number} creatorId - The ID of the user who created the comment.
 * @param {number} likes - The number of liks the comment has received.
 * @param {boolean} userLiked
 * @param {string} dateString - The date and time the comment was posted, as a string.
 * @param {string} content - The text content of the comment.
 * @param {number} indentLevel - The indentation level of the comment, indicating its depth in the hierarchy.
 */
const displayCommentDOM = (commentId, parentCommentId, creatorId, likes, userLiked, dateString, content, indentLevel) => {
    // Create the new comment box and its child elements
    const newCommentBox = document.createElement('div');
    newCommentBox.classList.add('thread-comment-box');
    newCommentBox.setAttribute('data-comment-id', commentId);
    newCommentBox.setAttribute('data-parent-comment-id', parentCommentId);
    newCommentBox.setAttribute('data-user-id', creatorId);

    const commentHeader = document.createElement('div');
    commentHeader.classList.add('comment-header');

    const headerButton = document.createElement('button');
    headerButton.classList.add('comment-header-button');

    const headerContent = document.createElement('p');
    headerContent.classList.add('comment-header-content', 'comment-content');
    const span = document.createElement('span');
    span.className = 'comment-likes';
    span.textContent = likes;
    const icon = document.createElement('i');
    icon.classList.add('thread-heart-icon');
    icon.textContent = '♥';
    headerContent.appendChild(span);
    headerContent.appendChild(icon);

    const dateContent = document.createElement('p');
    dateContent.classList.add('comment-header-content', 'comment-content', 'bold');
    dateContent.textContent = dateString;

    const commentContent = document.createElement('p');
    commentContent.classList.add('comment-content');
    commentContent.textContent = content;

    //a tags
    const reply = document.createElement('a');
    reply.classList.add('reply', 'comment-content', 'comment-link');
    reply.textContent = 'reply';
    
    const like = document.createElement('a');
    like.classList.add('like', 'comment-content', 'comment-link');
    if (userLiked) {
        like.textContent = 'unlike';
    } else {
        like.textContent = 'like';
    }
    
    const edit = document.createElement('a');
    edit.classList.add('edit', 'comment-content', 'comment-link');
    edit.textContent = 'edit';

    const delet = document.createElement('a');
    delet.classList.add('delete', 'comment-content', 'comment-link');
    delet.textContent = 'delete';

    // Append the elements together
    commentHeader.appendChild(headerButton);
    commentHeader.appendChild(headerContent);
    commentHeader.appendChild(dateContent);

    newCommentBox.appendChild(commentHeader);
    newCommentBox.appendChild(commentContent);

    newCommentBox.appendChild(reply);
    newCommentBox.appendChild(edit);
    newCommentBox.appendChild(delet);
    newCommentBox.appendChild(like);

    // Insert the new comment box into the DOM
    const marginLeft = indentLevel * 10;
    newCommentBox.style.marginLeft = `${marginLeft}px`;
    UI.threadComments.appendChild(newCommentBox);

    const token = localStorage.getItem('token');
    authAPICall('user', 'GET', token, undefined, `userId=${creatorId}`)
        .then(userData => {
            if (userData.image === null) {
                headerButton.style.backgroundImage =  `url('${DEFAULT_PROFILE_PICTURE_URL}')`
            } else {
                headerButton.style.backgroundImage =  `url('${userData.image}')`
            }
        })
        .catch(error => {
            showErrorPopUp(error);
        });

}

/**
 * Deletes a comment and all of its child comments from the comments list based on the indentation level.
 * It navigates down the comments list from the given comment, comparing the indentation levels to determine child comments.
 * Child comments are deleted if their indentation level is greater than the current comment's indentation level.
 * This function also handles the deleton of the parent comment itself and updates the UI accordingly,
 * including hiding or showing the main reply button based on certain conditions.
 * 
 * @param {Element} comment - The DOM element of the comment to start deletion from. Assumes the element has a style attribute for marginLeft indicating its indentation level and a data attribute for the comment ID.
 */

const deleteChildrenComments = (comment) => {
    let indent = parseInt(comment.style.marginLeft.slice(0, -2), 10);
    const token = localStorage.getItem('token');
    while (comment.nextElementSibling) {
        let currentNode = comment.nextElementSibling;
        let currentNodeIndent = parseInt(currentNode.style.marginLeft.slice(0, -2), 10);
        if (indent < currentNodeIndent) {
            // remove node
            const body = JSON.stringify({
                "id":  parseInt(currentNode.getAttribute('data-comment-id'), 10),
            });
            currentNode.remove();
            
            authAPICall('comment', 'DELETE', token, body)
            .catch(error => {
                showErrorPopUp(error);
            });
        } else {
            break;
        }
    }

    // delete parent commetn
    const body = JSON.stringify({
        "id":  parseInt(comment.getAttribute('data-comment-id'), 10),
    });
    comment.remove();
    
    authAPICall('comment', 'DELETE', token, body)
    .catch(error => {
        showErrorPopUp(error);
    });

    if (UI.threadComments.children.length === 0 && UI.threadText.getAttribute('data-is-locked') === 'false') {
        displayCommentReply(null, null, '', false);
        UI.threadMainReply.style.display = 'none';
    } else if (UI.threadComments.children.length === 0 && UI.threadText.getAttribute('data-is-locked') === 'true') {
        UI.threadMainReply.style.display = 'none';
    } else {
        UI.threadMainReply.style.display = 'inline-block';
    }
}

/**
    * Recursively displays comments, indenting based on their level in the hierarchy.
    * 
    * @param {number} indentLevel - The current indentation level, indicating the comment's depth.
    * @param {Array} comments - An array of comment objects to be displaayed. from the get request
    * @param {number} index - The current index in the comments array.
    * @param {number/null} parentCommentId - The ID of the parent comment, to maintain hierarchy.
*/
const displayCommentRecursive = (indentLevel, comments, index, parentCommentId) => {
    // get date
    let dateObject = new Date(comments[index].createdAt);
    let dateObjectNow = new Date();
    let difference = dateObjectNow - dateObject;
    let dateString;

    let minutes = Math.floor(difference / 60000); // 60*1000
    let hours = Math.floor(difference / 3600000); // 60*60*1000
    let days = Math.floor(difference / 86400000); // 24*60*60*1000
    let weeks = Math.floor(difference / (604800000)); // 7*24*60*60*1000

    if (minutes < 1) { // less then a min ago
        dateString = 'Just now';
    } else { 
        let time;
        let denomination;
        if (minutes < 60) {
            denomination = 'minute'
            time = minutes;
        } else if (hours < 24) { 
            denomination = 'hour'
            time = hours;
        } else if (days < 7) {
            denomination = 'day'
            time = days;
        } else { 
            denomination = 'week'
            time = weeks;
        }
        
        if (time > 1) {
            denomination += 's';
        }
        dateString = time + ' ' + denomination + ' ago'
    } 

    const creatorId = comments[index].creatorId
    const likes = comments[index].likes.length;
    const userLiked = comments[index].likes.includes(parseInt(localStorage.getItem('userId'), 10))

    const content = comments[index].content;
    const commentId = comments[index].id;
    
    // insert into dom
    displayCommentDOM(commentId, parentCommentId, creatorId, likes, userLiked, dateString, content, indentLevel)

    // call recursive function on all children
    let newIndex = 0;
    comments.forEach(comment => {
        if (comment.parentCommentId === commentId) {
            displayCommentRecursive(indentLevel + 1, comments, newIndex, commentId);
        }
        newIndex += 1;
    });
}

/**
 * Fetches and displays all the comments for a given thread. It first clears any existing comments, then
 * makes an API call to retrieve the comments associated with the threadId. Comments are sorted by their creation time
 * in descending order. The function then iteratively displays each comment, starting with top-level comments and
 * recursively displaying their child comments. Additionally, the UI is adjusted based on whether the thread is locked
 * and if there are any comments to display.
 * 
 * @param {string} threadId - The ID of the thread for which to display comments. This is used in the API call to fetch relevant comments.
 */
const displayComments = (threadId) => {
    while (UI.threadComments.firstChild) {
        UI.threadComments.removeChild(UI.threadComments.firstChild);
    }    
    const token = localStorage.getItem('token');
    authAPICall('comments', 'GET', token, undefined, `threadId=${threadId}`)
        .then(comments => {
            // with this data we need to recursively find the rest
            // first sort the comments baseed on most receent
            comments.sort((a, b) => {
                // Convert date strings to Date objects for comparison
                let dateA = new Date(a.createdAt);
                let dateB = new Date(b.createdAt);
              
                return dateB - dateA;
            });
            // now recurse
            let index = 0;
            comments.forEach(comment => {
                if (comment.parentCommentId === null) {
                    displayCommentRecursive(0, comments, index, null);
                }
                index += 1;
            });
            if (comments.length === 0 && UI.threadText.getAttribute('data-is-locked') === 'false') {
                displayCommentReply(null, null, '', false);
                UI.threadMainReply.style.display = 'none';
            } else if (comments.length === 0 && UI.threadText.getAttribute('data-is-locked') === 'true') {
                UI.threadMainReply.style.display = 'none';
            } else {
                UI.threadMainReply.style.display = 'inline-block';
            }


        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Prepares and displays the dashboard screen, showing a list of threads. It hides other screens, displays the dashboard,
 * and makes an API call to fetch threads. If a threadId is provided, it displays that specific thread; otherwise, it displays
 * the most recent thread. The function is also responsible foor setting up the UI elements based on the state of the application,
 * such as displaying the logout and profile buttons, and handling the creation of new threads.
 * 
 * @param {number} [threadId=undefined] - An optional thred ID to display upon loading the dashboard. If undefined, the most recent thread is displayed.
 */
const showDashboard = (threadId = undefined) => {
    UI.screens.forEach(screen => {
        screen.style.display = 'none';
    });
    UI.dashboardScreen.style.display = 'flex';

    UI.logoutButton.style.display = 'block';
    UI.profileButton.style.display = 'block';
    UI.verticalLine.style.display = 'block';
    UI.createButton.style.display = 'block';
    makeButtonCreate();
    UI.profileButton.textContent = 'Profile';
    UI.heartButton.style.display = 'block';
    UI.watchButton.style.display = 'block';

    const token = localStorage.getItem('token');
    // remove all threads
    UI.threadsList.setAttribute('data-threads-count', 0);
    while (UI.threadsList.firstChild) {
        UI.threadsList.removeChild(UI.threadsList.firstChild);
    }

    // First API call to get list of threads, there will always be minmum one so we just put the promise on  this one
    authAPICall('threads', 'GET', token, undefined, 'start=0')
        .then(threads => {
            if (threadId === undefined) {
                displayThread(String(threads[0]));
                // need threads list to load to display thread
            } else {
                displayThread(String(threadId));
            }
            displayThreads(threads);
            UI.threadsList.setAttribute('data-threads-count', threads.length)
            if (threads.length === 5) {
                loadMoreThreadsIfNeeded();
            }

        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Displays the specified user's profile by setting various UI elements to reflect the user's data.
 * This includes handling the visibility of screens and buttons, clearing any previous profile information,
 * and fetching the user's data from the server. If the profile belongs to the current user, they are given the
 * option to update it. Additionally, it initiates the display of threads created by the user.
 *
 * @param {string} userId - The ID of the user whose profile is to be displayed.
 */
const showUserProfile = (userId) => {
    UI.userProfileScreen.setAttribute('data-user-id', userId);
    UI.screens.forEach(screen => {
        screen.style.display = 'none';
    });
    UI.userProfileScreen.style.display = 'flex';
    removeAllHeaderButtons();
    UI.logoutButton.style.display = 'block';
    makeButtonDashboard()
    UI.createButton.style.display = 'block';
    // only if the user owns the profile can they update it
    if (userId === localStorage.getItem('userId')) {
        UI.profileButton.textContent = 'Update';
        UI.profileButton.style.display = 'block';
    }
    // clear all previous values
    UI.userProfileText.querySelector('.profile-pic-container img').src = '';
    UI.userProfileText.querySelector('.email-field').textContent = '';
    UI.userProfileText.querySelector('.name-field').textContent = '';
    UI.userProfileText.querySelector('.admin-field').textContent = '';
    while (UI.userProfileThreadsList.firstChild) {
        UI.userProfileThreadsList.removeChild(UI.userProfileThreadsList.firstChild);
    }

    const token = localStorage.getItem('token');
    authAPICall('user', 'GET', token, undefined, `userId=${userId}`)
        .then(userDataProfile => {
            if (userDataProfile.image !== null) {
                UI.userProfileText.querySelector('.profile-pic-container img').src = userDataProfile.image;
            } else {
                UI.userProfileText.querySelector('.profile-pic-container img').src = DEFAULT_PROFILE_PICTURE_URL;
            }
            UI.userProfileText.querySelector('.email-field').textContent = userDataProfile.email;
            UI.userProfileText.querySelector('.name-field').textContent = userDataProfile.name;

            authAPICall('user', 'GET', token, undefined, `userId=${localStorage.getItem('userId')}`)
                .then(userDataClient => {
                    if (userDataClient.admin && !userDataProfile.admin) {
                        UI.userProfileText.querySelector('.admin-field').style.display = 'none';
                        UI.adminSelect.style.display = 'block';
                        UI.updateUserPermissionsButton.style.display = 'block';

                    } else {
                        UI.userProfileText.querySelector('.admin-field').textContent = userDataProfile.admin ? 'Admin' : 'User';
                        UI.userProfileText.querySelector('.admin-field').style.display = 'block';
                        UI.adminSelect.style.display = 'none';
                        UI.updateUserPermissionsButton.style.display = 'none';

                    }
                })
                .catch(error => {
                    showErrorPopUp(error);
                });


            // recursively add all threads that user has created
            displayUserProfileThreadsRecursive(0, parseInt(userId, 10))
        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Recursively fetches and displays threads created by a specific user, starting from a given index.
 * This function makes a paginated API call to retrieve a set of threads. For each batch of threads retrieved,
 * it displays those created by the user. If the maximum number of threads is retrieved, it recursively fetches
 * the next batch until no more threads are available.
 *
 * @param {number} start - The starting index from which to begin the paginated retrieval of threads.
 * @param {number} userId - The ID of the user whoosse threads are to be displayed.
 */
const displayUserProfileThreadsRecursive = (start, userId) => {
    const token = localStorage.getItem('token');
    authAPICall('threads', 'GET', token, undefined, `start=${start}`)
        .then(threads => {
            displayThreadsUserProfile(threads, 0, userId); 
            if (threads.length === 5) {
                displayUserProfileThreadsRecursive(start + 5, userId);
            }
        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Displays a list of threads for a user's profile by making an API call to fetch detailed data for each thread.
 * It iterates through the list of threads and, for each one, checks if it was created by the specified user.
 * If so, the thread is displayed on the user's profile. This function is called recursively for each thread
 * in the list until all threads have been processed or displayed.
 *
 * @param {Array<number>} threads - An array of thread IDs to be displayed on the user's profile.
 * @param {number} index - The current index in the threads array being processed.
 * @param {number} userId - The ID of the user to chck against the thread creator ID.
 */
const displayThreadsUserProfile = (threads, index, userId) => {
    if (threads.length === index) {
        return // no more threads in current threads list
    }
    // get the thread 
    const token = localStorage.getItem('token');
    authAPICall('thread', 'GET', token, undefined, `id=${threads[index]}`)
        .then(threadData => {
            if (threadData.creatorId === userId) {
                // append cell and then add infomation to that cell
                appendThreadUserProfile(threadData.title, threadData.content, threadData.likes.length, threads[index]);
            }
            displayThreadsUserProfile(threads, index + 1, userId)
        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Appends a thread to the user profile page and fetches the number of comments for that thread.
 * This function creates a thread box element that includes the thread's title, content, and initial like count,
 * and then appends it to the users profile. it also makes an API call to fetch the current number of comments for
 * the thread, updating the displayed comment count upon successful retrieval.
 *
 * @param {string} titleStr - The title of the thread.
 * @param {string} contentStr - The content of the thread.
 * @param {string} likesStr - The initial likes count to be displayed.
 * @param {number} threadId - The ID of the thread, used for fetching the current number of comments.
 */
const appendThreadUserProfile = (titleStr, contentStr, likesStr, threadId) => {
    // Create the thread box.
    const threadBox = document.createElement('div');
    threadBox.className = 'thread-box';

    const title = document.createElement('h4');
    title.textContent = titleStr;

    const content = document.createElement('p');
    content.textContent = contentStr;

    const socialInteractionContainer = document.createElement('div');
    socialInteractionContainer.className = 'thread-box-social-interaction-container';

    const likes = document.createElement('div');
    likes.className = 'thread-box-likes';
    const heartIcon = document.createElement('i');
    heartIcon.className = 'thread-heart-icon';
    heartIcon.textContent = '♥';
    const likesText = document.createElement('span');
    likesText.textContent = likesStr;

    likes.appendChild(heartIcon);
    likes.appendChild(likesText);

    const comments = document.createElement('div');
    comments.className = 'thread-box-comments';
    const commentIcon = document.createElement('i');
    commentIcon.textContent = '\u{1F4AC}';
    const commentsText = document.createElement('span');
    commentsText.textContent = 'comments';

    comments.appendChild(commentIcon);
    comments.appendChild(commentsText);

    socialInteractionContainer.appendChild(likes);
    socialInteractionContainer.appendChild(comments);

    threadBox.appendChild(title);
    threadBox.appendChild(content);
    threadBox.appendChild(socialInteractionContainer);

    UI.userProfileThreadsList.appendChild(threadBox);

    // now get the comments
    const token = localStorage.getItem('token');
    authAPICall('comments', 'GET', token, undefined, `threadId=${threadId}`)
        .then(comments => {
            commentsText.textContent = comments.length;
        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Poll for updates on threads watched by the user, comparing the number of comments on each thread against
 * a previously stored count. If an increase in comments is detected, a notification is displayed to the user.
 * This function fetches all threads that the user is watching, checks for updates in the comment counts, and
 * updates the local storage with the new countd. Notifictions are generatd for threads with new comments.
 */
const pollWatchedThreads = () => {
    // first get all comments
    const token = localStorage.getItem('token');
    const userId = parseInt(localStorage.getItem('userId'), 10);
    const watchedThreadsNew = {};
    fetchAllThreads(0, [])
        .then(allThreads => {
            const threadsPromises = allThreads.map(thread => {
                return authAPICall('thread', 'GET', token, undefined, `id=${thread}`)
                    .then(threadData => {
                        // Check if the user is watching the thread
                        if (threadData.watchees.includes(userId)) {
                            // If watched, get comments for the thread
                            return authAPICall('comments', 'GET', token, undefined, `threadId=${thread}`)
                                .then(comments => {
                                    // Record the number of comments for watched threads
                                    watchedThreadsNew[thread] = comments.length;
                                });
                        }
                    });
            });
            // Wait for all threads to be processed
            return Promise.all(threadsPromises);
        })
        .then(() => {
            // add watched threads and there comments to local storage
            // loop throuhg local storage entries for local stoagr .get
            const watchedThreadsPrevious = JSON.parse(localStorage.getItem('watchedThreads') || '{}');
            for (const [thread, numComments] of Object.entries(watchedThreadsNew)) {
                // if thread in watched threads and if numcomments for that thread went up copmared to 
                if (watchedThreadsPrevious[thread] !== undefined && numComments > watchedThreadsPrevious[thread]) {
                    // only one notification per thread watched
                    const notification = new Notification('Qanda: A new comment has been posted on a thread you watch!');
                }
            }
            // store in local storage only if token is still there because it means we still are logged in
            if (localStorage.getItem('token') !== null) {
                localStorage.setItem('watchedThreads', JSON.stringify(watchedThreadsNew));
            }
        })
        .catch(error => {
            showErrorPopUp(error);
        });
}

/**
 * Fetches all threads, paginating through the data if more than 5 threads are returned at a time.
 * @param {number} current - The current starting index from where to fetch the threads.
 * @param {Array} allThreads - The accumulator array where all fetched threads are stored.
 * @returns {Promise<Array>} A promise that resolves with an array of all threads.
 */

const fetchAllThreads = (current, allThreads) => {
    return new Promise((resolve, reject) => {
        // Making the API call
        const token = localStorage.getItem('token');
        authAPICall('threads', 'GET', token, undefined, `start=${current}`)
            .then(threads => {
                const updatedThreads = allThreads.concat(threads);

                if (threads.length < 5) {
                    resolve(updatedThreads);
                } else {
                    fetchAllThreads(current + 5, updatedThreads, token).then(resolve).catch(reject);
                }
            })
            .catch(error => {
                reject(error);
                showErrorPopUp(error);
            });
    });
}

/**
 * Displays the user profile update screen, hides all other screens, and updates UI elements accordingly.
 */
const showUserProfileUpdate = () => {
    UI.screens.forEach(screen => {
        screen.style.display = 'none';
    });
    UI.userProfileUpdateScreen.style.display = 'flex';
    removeAllHeaderButtons();
    UI.logoutButton.style.display = 'block';
    makeButtonDashboard();
    UI.createButton.style.display = 'block';
    UI.profileButton.textContent = 'Profile';
    UI.profileButton.style.display = 'block';
    UI.userProfileForm.reset()

}

/**
 * Loads more threads if the displayed threads do not fill the current viewport, calling itself recursively until enough threads are loaded or no more threads are available.
 */
const loadMoreThreadsIfNeeded = () => {
    const threadsListHeight = UI.threadsList.clientHeight;
    const threadsDisplayedCount = parseInt(UI.threadsList.getAttribute('data-threads-count'), 10);
    const totalThreadsHeight = threadsDisplayedCount * 75;

    if (totalThreadsHeight < threadsListHeight + 5) { // 5 is so there a buffer or bit of a scroll in worst case
        const token = localStorage.getItem('token');
        authAPICall('threads', 'GET', token, undefined, `start=${threadsDisplayedCount}`)
            .then(threads => {
                displayThreads(threads); 
                UI.threadsList.setAttribute('data-threads-count', threadsDisplayedCount + threads.length);
                if (threads.length === 5) {
                    loadMoreThreadsIfNeeded();
                }
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    }
};

/**
 * Displays detailed information about a single thread identified by its ID.
 * @param {string} threadId - The ID of the thread to display.
 */
const displayThread = (threadId) => {
    const token = localStorage.getItem('token');

    // Initial API call to get the thread info
    authAPICall('thread', 'GET', token, undefined, `id=${threadId}`)
        .then(data => {
            UI.threadText.querySelector('h2').textContent = data.title;
            UI.threadText.querySelector('p').textContent = data.content;
            UI.threadText.querySelector('.thread-likes').textContent = data.likes.length;
            UI.threadText.querySelector('.thread-lock-icon').textContent = data.lock ? '🔒': '🔓';
            UI.threadText.querySelector('.thread-locked').textContent = data.lock ? 'LOCKED': 'UNLOCKED';
            UI.threadText.setAttribute('data-thread-id', threadId);
            UI.threadText.setAttribute('data-is-locked', data.lock);

            const userId = parseInt(localStorage.getItem('userId'), 10);
            const hasUserLiked = data.likes.includes(userId);
            const hasUserWatched = data.watchees.includes(userId);
            if (hasUserLiked) {
                likeLikeButton();
            } else {
                unlikeLikeButton();
            }
            if (hasUserWatched) {
                watchWatchButton();
            } else {
                unwatchWatchButton();
            }

            return canUserChangeThread(parseInt(threadId, 10), data.creatorId, userId);
        })
        .then(canChange => {
            if (canChange && UI.threadText.getAttribute('data-is-locked') === 'false') {
                // show edit and delete
                UI.editButton.style.display = 'block';
                UI.deleteButton.style.display = 'block';
            } else if (canChange && UI.threadText.getAttribute('data-is-locked') === 'true') {
                UI.deleteButton.style.display = 'block';
                UI.editButton.style.display = 'none';
            } else {
                // dont show, already not showing
                UI.editButton.style.display = 'none';
                UI.deleteButton.style.display = 'none';
            }
        })
        .catch(error => {
            showErrorPopUp(error);
        });

    displayComments(threadId);
}

/**
 * Displays a list of threads, fetching additional information as needed and appending them to the UI.
 * @param {Array<number>} threads - The list of thread IDs to display.
 */
const displayThreads = (threads) => {
    // for each thread display in the appropriate place
    const token = localStorage.getItem('token');
    const threadsDisplayedCount = parseInt(UI.threadsList.getAttribute('data-threads-count'), 10);

    // add the amount of cells that is in threads
    for (let i = 0; i < threads.length; i++) {
        appendThreadCell();
    }

    for (let i = 0; i < threads.length; i++) {
        const thread = threads[i];
        authAPICall('thread', 'GET', token, undefined, `id=${thread}`)
            .then(threadData => {
                return authAPICall('user', 'GET', token, undefined, `userId=${threadData.creatorId}`)
                    .then(userData => {
                        return { threadData: threadData, userData: userData };
                    });
            })
            .then(({ threadData, userData }) => {
                const dateObj = new Date(threadData.createdAt);
                const formattedDate = dateObj.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                });
                
                changeCell(i + threadsDisplayedCount, threadData.title, formattedDate, userData.name, threadData.creatorId, threadData.likes.length, thread)
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    }
}

/**
 * Updates the 'create' button to serve as a 'Dashboard' button, adjusting its text and width.
 */
const makeButtonDashboard = () => {
    UI.createButton.textContent = 'Dashboard';
    UI.createButton.style.width = '150px';

}

/**
 * Updates the 'create' button to serve as a 'Create' button, adjusting its text and width.
 */
const makeButtonCreate = () => {
    UI.createButton.textContent = 'Create';
    UI.createButton.style.width = '100px';

}

/**
 * Appends a new thread cell to the UI, setting up the structure for displaying thread information.
 */
const appendThreadCell = () => {
    const li = document.createElement('li');
    li.setAttribute('data-thread-id', '');

    const titleDiv = document.createElement('div');
    titleDiv.classList.add('threads-list-title');
    li.appendChild(titleDiv);

    const authorA = document.createElement('a');
    authorA.classList.add('threads-list-author');

    // Create a new div element to wrap the anchor
    const authorDiv = document.createElement('div');
    authorDiv.classList.add('author-container');

    // Append the anchor to the div
    authorDiv.appendChild(authorA);

    // Finally, append the div to the list item
    li.appendChild(authorDiv);

    const dateLikesDiv = document.createElement('div');
    dateLikesDiv.classList.add('threads-list-date-likes');

    const postDateSpan = document.createElement('span');
    postDateSpan.classList.add('threads-list-post-date');
    dateLikesDiv.appendChild(postDateSpan);

    const likesSpan = document.createElement('span');
    likesSpan.classList.add('threads-list-likes');

    const heartIcon = document.createElement('i');
    heartIcon.classList.add('threads-list-heart-icon');
    likesSpan.appendChild(heartIcon);

    const likesCountSpan = document.createElement('span');
    likesCountSpan.classList.add('likes-count');
    likesSpan.appendChild(likesCountSpan);

    dateLikesDiv.appendChild(likesSpan);

    li.appendChild(dateLikesDiv);

    UI.threadsList.appendChild(li);
}

/**
 * Updates the information displayed in a specific thread cell in the UI.
 * @param {number} cell - The index of the cell to update.
 * @param {string} title - The title of thread.
 * @param {string} date - The formatted creation date of the thread.
 * @param {string} author - The name of the thread's creator.
 * @param {number} authorId - The user ID of the thread's creator.
 * @param {number} likes - The number of likes the thread has received.
 * @param {string} threadId - The ID of the thread.
 */
const changeCell = (cell, title, date, author, authorId, likes, threadId) => {
    UI.threadsListItems[cell].querySelector('.threads-list-title').textContent = title;
    UI.threadsListItems[cell].querySelector('.threads-list-author').textContent = author;
    UI.threadsListItems[cell].querySelector('.threads-list-post-date').textContent = date;
    UI.threadsListItems[cell].querySelector('.likes-count').textContent = likes;
    UI.threadsListItems[cell].querySelector('.threads-list-heart-icon').textContent = '♥ ';
    UI.threadsListItems[cell].setAttribute('data-thread-id', threadId);
    UI.threadsListItems[cell].setAttribute('data-user-id', authorId);
}

/**
 * Hides all header buttons by setting there display style to 'none'.
 */
const removeAllHeaderButtons = () => {
    UI.logoutButton.style.display = 'none';
    UI.createButton.style.display = 'none';
    UI.deleteButton.style.display = 'none';
    UI.editButton.style.display = 'none';
    UI.heartButton.style.display = 'none';
    UI.watchButton.style.display = 'none';
    UI.verticalLine.style.display = 'none';
    UI.profileButton.style.display = 'none';
}

/**
 * Updates the likes count for a specific thread in the thread list by a certain amount.
 * @param {number} x - The nummber to add to the current likes count. Can be negative to decrease.
 * @param {string|number} threadId - The ID of the thread whose likes count is to be changed.
 */
const changeLikesThreadList = (x, threadId) => {
    Array.from(UI.threadsListItems).forEach(thread => {
        if (thread.getAttribute('data-thread-id') === String(threadId)) {
            let likesCount = parseInt(thread.querySelector('.likes-count').textContent, 10);
            likesCount += x;
            thread.querySelector('.likes-count').textContent = likesCount;
        }
    });
}

/**
 * Updates the likes count for the currently displayed thread by a certain amount.
 * @param {number} x - The number to add to the current likes count. Can be negative to decrease.
 */
const changeLikesThread = (x) => {
    let likesCount = parseInt(UI.threadText.querySelector('.thread-likes').textContent, 10);
    likesCount += x; 
    UI.threadText.querySelector('.thread-likes').textContent = likesCount;
}

///////////////////////////////////////////////////////////////////////
//// EVENT LISTENERS ////
///////////////////////////////////////////////////////////////////////

// goes to register form
UI.registerLink.addEventListener('click', () => {
    UI.loginScreen.style.display = 'none';
    UI.registerScreen.style.display = 'flex';
    UI.loginForm.reset();
});

// goes to login form
UI.loginLink.addEventListener('click', () => {
    UI.registerScreen.style.display = 'none';
    UI.loginScreen.style.display = 'flex';
    UI.registerForm.reset();
});

// If successful displays dashboard
UI.loginForm.addEventListener('submit', function(event) {
    event.preventDefault();
    
    const formData = new FormData(UI.loginForm);
    let formDataObj = Object.fromEntries(formData.entries());
    const body = JSON.stringify(formDataObj);

    noAuthAPICall('auth/login', 'POST', body)
        .then(data => {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            UI.loginForm.reset();
            // get comments and likes for notificaitons
            startPolling();
            showDashboard();

        })
        .catch(error => {
            showErrorPopUp(error);
        });
});

// If successful displays dashboard
UI.registerForm.addEventListener('submit', function(event) {
    event.preventDefault();

    if (UI.registerForm['password'].value !== UI.registerForm['confirmPassword'].value) {
        showErrorPopUp('Passwords do not match.');
        return;
    }

    const formData = new FormData(UI.registerForm);
    formData.delete('confirmPassword');

    let formDataObj = Object.fromEntries(formData.entries());
    const body = JSON.stringify(formDataObj);

    noAuthAPICall('auth/register', 'POST', body)
        .then(data => {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userId', data.userId);
            UI.registerForm.reset();
            startPolling();
            showDashboard();
        })
        .catch(error => {
            showErrorPopUp(error);
        });
});

// Exits the error pop up to the state before it was called
// unblurs every screen
UI.errorPopUpButton.addEventListener('click', () => {
    // blur everything else
    UI.screens.forEach(screen => {
        screen.style.filter = 'blur(0px)';
    });
    UI.errorPopUp.style.display = 'none';
});

// Goes back to login screen
UI.logoutButton.addEventListener('click', () => {
    stopPolling();
    UI.screens.forEach(screen => {
        screen.style.display = 'none';
    });
    UI.loginScreen.style.display = 'flex';
    removeAllHeaderButtons();
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('watchedThreads');
});

// Goes to create thread screen or back to dashboard
UI.createButton.addEventListener('click', () => {
    if (UI.createButton.textContent === 'Create') {
        UI.fullThreadScreen.style.display = 'block';
        UI.dashboardScreen.style.display = 'none';
        removeAllHeaderButtons();
        makeButtonDashboard();
        UI.logoutButton.style.display = 'block';
        UI.createButton.style.display = 'block';
        UI.fullThreadForm.querySelector('button[type="submit"]').textContent = 'Submit';
        UI.lockInput.style.display = 'none';
    } else {
        UI.fullThreadForm.reset();
        showDashboard();
    }
});

// for editing and submitting new thread, returns back to dashboard
UI.fullThreadForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const formData = new FormData(UI.fullThreadForm);
    const token = localStorage.getItem('token');
    let formDataObj = Object.fromEntries(formData.entries());
    formDataObj.isPublic = formDataObj.isPublic === "on";
    formDataObj.lock = formDataObj.lock === "on";

    // Check if the button is 'Submit' or 'Edit'
    if (UI.fullThreadForm.querySelector('button[type="submit"]').textContent === 'Submit') {
        delete formDataObj.lock;
        const body = JSON.stringify(formDataObj);

        authAPICall('thread', 'POST', token, body)
            .then(data => {
                UI.fullThreadForm.reset()
                showDashboard();
            })
            .catch(error => {
                showErrorPopUp(error);
            });

    } else if (UI.fullThreadForm.querySelector('button[type="submit"]').textContent === 'Save') {

        const threadId = UI.fullThreadScreen.getAttribute('data-thread-id');
        formDataObj.id = threadId;

        const body = JSON.stringify(formDataObj);

        authAPICall('thread', 'PUT', token, body)
            .then(data => {
                UI.fullThreadForm.reset();
                showDashboard(threadId);
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    }
});

// when a thread from the thread list is clicked, displays that thread
UI.threadsList.addEventListener('click', function(event) {
    let targetElement = event.target;

    // Check if the click is on an author element
    if (targetElement.classList.contains('threads-list-author')) {
        const userId = targetElement.closest('li').getAttribute('data-user-id');
        showUserProfile(userId);
        return; // Stop further execution since the author's profile is being handled
    }

    // Traverse up the DOM to find the nearest <li> parent
    while (targetElement && targetElement.tagName !== 'LI') {
        targetElement = targetElement.parentElement;
    }

    // Once the nearest <li> is found and it's not an author click, check if it has a 'data-thread-id' attribute
    if (targetElement && targetElement.hasAttribute('data-thread-id')) {
        const threadId = targetElement.getAttribute('data-thread-id');
        displayThread(threadId);
    }
});

UI.threadsList.addEventListener('scroll', () => {
    const scrollTop = UI.threadsList.scrollTop;
    const scrollHeight = UI.threadsList.scrollHeight;
    const clientHeight = UI.threadsList.clientHeight;
    const hasScrollableContent = scrollHeight > clientHeight;
    const scrolledToBottom = hasScrollableContent && Math.ceil(scrollTop + clientHeight) >= scrollHeight;
  
    if (scrolledToBottom) {

        const token = localStorage.getItem('token');
        const threadsDisplayedCount = parseInt(UI.threadsList.getAttribute('data-threads-count'), 10);
        authAPICall('threads', 'GET', token, undefined, `start=${threadsDisplayedCount}`)
            .then(threads => {
                displayThreads(threads); 
                UI.threadsList.setAttribute('data-threads-count', threadsDisplayedCount + threads.length);
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    }
});

// goes to edit thread screen
UI.editButton.addEventListener('click', () => {
    UI.fullThreadForm.reset()

    UI.fullThreadScreen.style.display = 'block';
    UI.dashboardScreen.style.display = 'none';
    removeAllHeaderButtons()
    UI.logoutButton.style.display = 'block';
    makeButtonDashboard();
    UI.createButton.style.display = 'block';
    UI.fullThreadForm.querySelector('button[type="submit"]').textContent = 'Save';
    UI.lockInput.style.display = 'block';

    const token = localStorage.getItem('token');
    const threadId = UI.threadText.getAttribute('data-thread-id');
    authAPICall('thread', 'GET', token, undefined, `id=${threadId}`)
        .then(threadData => {
            // fill in all thread data
            UI.fullThreadForm.querySelector('input[name="title"]').value = threadData.title;
            UI.fullThreadForm.querySelector('textarea[name="content"]').value = threadData.content;
            UI.fullThreadForm.querySelector('input[name="isPublic"]').checked = threadData.isPublic;
            UI.fullThreadForm.querySelector('input[name="lock"]').checked = threadData.lock;

            UI.fullThreadScreen.setAttribute('data-thread-id', threadId);

            UI.fullThreadForm.querySelector('button[type="submit"]').textContent = 'Save';
        })
        .catch(error => {
            showErrorPopUp(error);
        });
});

// deletes thread and re renders dashboard
UI.deleteButton.addEventListener('click', () => {
    // assume they can delete it if they have access ot thins button
    const token = localStorage.getItem('token');
    const threadId = UI.threadText.getAttribute('data-thread-id');
    const body = JSON.stringify({
        id: parseInt(threadId, 10)
    });
    authAPICall('thread', 'DELETE', token, body)
        .then(data => {
            showDashboard();
        })
        .catch(error => {
            showErrorPopUp(error);
        });
});

// likes or unlikes the thread depending on the value of isHeartButtonClicked
UI.heartButton.addEventListener('click', () => {
    if (UI.threadText.getAttribute('data-is-locked') === "true") {
        showErrorPopUp("thread is locked");
        return
    }
    const token = localStorage.getItem('token');
    const threadId = parseInt(UI.threadText.getAttribute('data-thread-id'), 10);
    const body = JSON.stringify({
        "id": threadId,
        "turnon": !isHeartButtonClicked
    });

    // needs to be here otherwise might send 2 equal http requests if like button is pressed in rapid succesion
    isHeartButtonClicked = !isHeartButtonClicked;
    // change ui
    // dont reload just change values
    if (isHeartButtonClicked) {
        UI.heartButtonIcon.querySelector('path').setAttribute('fill', 'red');
        changeLikesThreadList(1, threadId);
        changeLikesThread(1, threadId);
    } else {
        UI.heartButtonIcon.querySelector('path').setAttribute('fill', 'none');
        changeLikesThreadList(-1, threadId);
        changeLikesThread(-1, threadId);
    }
    // also in the threads list

    authAPICall('thread/like', 'PUT', token, body)
        .catch(error => {
            showErrorPopUp(error);
        });
});

// watches or unwatches the thread depending on the value of isWatchButtonClicked
UI.watchButton.addEventListener('click', () => {
    const token = localStorage.getItem('token');
    const threadId = parseInt(UI.threadText.getAttribute('data-thread-id'), 10);
    const body = JSON.stringify({
        "id": threadId,
        "turnon": !isWatchButtonClicked
    });
    isWatchButtonClicked = !isWatchButtonClicked;

    if (isWatchButtonClicked) {
        let lines = UI.watchButtonIcon.querySelectorAll('line');
        lines.forEach(line => line.setAttribute('stroke-width', '0'));
    } else {
        let lines = UI.watchButtonIcon.querySelectorAll('line');
        lines.forEach(line => line.setAttribute('stroke-width', '2'));
    }
    authAPICall('thread/watch', 'PUT', token, body)
        .catch(error => {
            showErrorPopUp(error);
        });
});

// posts or edits a comment then re renders the entire dashboard
UI.threadCommentButton.addEventListener('click', () => {
    const token = localStorage.getItem('token');
    
    let parentCommentId = UI.replyBox.getAttribute('data-parent-comment-id');
    if (parentCommentId === 'null') {
        parentCommentId = null;
    } else {
        parentCommentId = parseInt(parentCommentId, 10);
    }
    
    if (UI.replyBox.getAttribute('data-editing') === 'false') { // editing
        const body = JSON.stringify({
            "content": UI.threadCommentInput.value,
            "threadId": parseInt(UI.threadText.getAttribute('data-thread-id'), 10),
            "parentCommentId": parentCommentId
        });
        authAPICall('comment', 'POST', token, body)
            .then(() => {
                showDashboard(UI.threadText.getAttribute('data-thread-id'))
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    } else { // posting
        const body = JSON.stringify({
            "id": parseInt(UI.replyBox.getAttribute('data-comment-id'), 10),
            "content": UI.threadCommentInput.value,
        });
        authAPICall('comment', 'PUT', token, body)
            .then(() => {
                showDashboard(UI.threadText.getAttribute('data-thread-id'));
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    }
});

// handles likes replying and editing comments
// doesnt reload dom
// only submitting edit or reply comment will
UI.threadComments.addEventListener('click', function(event) {
    // check if a link was pressed
    if (event.target.tagName.toLowerCase() === 'a') {
        event.preventDefault(); // Prevent the default link action
        if (UI.threadText.getAttribute('data-is-locked') === 'true') {
            showErrorPopUp("thread is locked");
            return
        }
        if (event.target.classList.contains('reply')) {
            // since its a reply we want the parent to be the comment that got clicked
            // we want to put the reply box after the parent so commentBefore id is also parent
            unhideComments();
            const parent = event.target.closest('.thread-comment-box');
            let parentCommentId;
            if (parent.getAttribute('data-comment-id') === "null") {
                parentCommentId = null;
            } else {
                parentCommentId = parseInt(parent.getAttribute('data-comment-id'), 10)
            }

            displayCommentReply(parentCommentId, parentCommentId, '', false);


        } else if (event.target.classList.contains('like')) {
            // chnage locally
            const comment = event.target.closest('.thread-comment-box');
            const likesSpan = comment.querySelector('.comment-likes');
            const currentLikes = parseInt(likesSpan.textContent, 10);
            let newLikes;
            let like;
            if (event.target.textContent === 'unlike') {
                event.target.textContent = 'like';
                newLikes = currentLikes - 1;
                like = false;
            } else {
                event.target.textContent = 'unlike';
                newLikes = currentLikes + 1;
                like = true;
            }
            likesSpan.textContent = newLikes.toString();

            // send request
            // no need to reload
            const body = JSON.stringify({
                "id":  comment.getAttribute('data-comment-id'),
                "turnon": like
            });
            const token = localStorage.getItem('token');
            authAPICall('comment/like', 'PUT', token, body)
                .catch(error => {
                    showErrorPopUp(error);
                });

        } else if (event.target.classList.contains('edit')) {
            unhideComments();
            const comment = event.target.closest('.thread-comment-box');
            let commentId;
            if (comment.getAttribute('data-comment-id') === "null") {
                commentId = null;
            } else {
                commentId = parseInt(comment.getAttribute('data-comment-id'), 10)
            }

            let parentCommentId;
            if (comment.getAttribute('data-parent-comment-id') === "null") {
                parentCommentId = null;
            } else {
                parentCommentId = parseInt(comment.getAttribute('data-parent-comment-id'), 10)
            }

            // since its an edit we want the parent to be the pareent of the comment that got pressed
            // since its an edit we want the insert before id to be the actul comment that was clicked

            const commentContent = comment.querySelector('.comment-header + .comment-content').textContent;
            displayCommentReply(parentCommentId, commentId, commentContent, true);
            comment.style.display = 'none'; // hide the comment
            comment.setAttribute('data-hidden', 'true');
        } else if (event.target.classList.contains('delete')) {
            const comment = event.target.closest('.thread-comment-box');
            deleteChildrenComments(comment);
        }
        //////
    } else if (event.target.classList.contains('comment-header-button')) {
        const comment = event.target.closest('.thread-comment-box');
        showUserProfile(comment.getAttribute('data-user-id'));
    }
});

// displays reply comment
UI.threadMainReply.addEventListener('click', function(event) {
    if (UI.threadText.getAttribute('data-is-locked') === 'true') {
        showErrorPopUp("thread is locked");
        return
    }
    unhideComments();
    displayCommentReply(null, null, '', false);
});

// shows user profile or update profile
UI.profileButton.addEventListener('click', () => {
    if (UI.profileButton.textContent === 'Profile') {
        showUserProfile(localStorage.getItem('userId'));
    } else if (UI.profileButton.textContent === 'Update') {
        showUserProfileUpdate();
    }
});

// previews selected image in update profile
UI.previewButton.addEventListener('click', function(event) {
    event.preventDefault();
    const file = UI.profilePictureInput.files[0]; 
    if (file) {
        const reader = new FileReader(); 
        reader.onload = function(event) {
            UI.updateUserImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

});

// submits user profile update form and dispalys user profile again
UI.userProfileForm.addEventListener('submit', function(event) {
    event.preventDefault();

    if (UI.userProfileForm['password'].value !== UI.userProfileForm['confirmPassword'].value) {
        showErrorPopUp('Passwords do not match.');
        return;
    }

    const formData = new FormData(UI.userProfileForm);

    formData.delete('confirmPassword');
    if (UI.userProfileForm['email'].value === "") {
        formData.delete('email');
    }
    if (UI.userProfileForm['name'].value === "") {
        formData.delete('name');
    }
    if (UI.userProfileForm['password'].value === "") {
        formData.delete('password');
    }
    if (UI.userProfileForm['image'].files.length === 0) {
        formData.delete('image');
    }

    let formDataObj = Object.fromEntries(formData.entries());

    fileToDataUrl(formDataObj['image']).then(dataUrl => {
        formDataObj['image'] = dataUrl;
        const body = JSON.stringify(formDataObj);
        const token = localStorage.getItem('token');

        authAPICall('user', 'PUT', token, body)
            .then(data => {
                UI.userProfileForm.reset();
                showUserProfile(localStorage.getItem('userId'));
            })
            .catch(error => {
                showErrorPopUp(error);
            });
    });
});

// updates users permissions and dispalys user profile again
UI.updateUserPermissionsButton.addEventListener('click', () => {
    const body = JSON.stringify({
        "userId": parseInt(UI.userProfileScreen.getAttribute('data-user-id'), 10),
        "turnon": UI.adminSelect.value === 'admin'
    });
    const token = localStorage.getItem('token');
    authAPICall('user/admin', 'PUT', token, body)
        .then(data => {
            showUserProfile(UI.userProfileScreen.getAttribute('data-user-id'));
        })
        .catch(error => {
            showErrorPopUp(error);
        });
});

///////////////////////////////////////////////////////////////////////
                        //// MISCELLANEOUS ////
///////////////////////////////////////////////////////////////////////

if ('Notification' in window) {
    if (Notification.permission === 'granted') {
        const notification = new Notification('Qanda: Notifications are on for Qanda.');
    } else if (Notification.permission !== 'denied' || Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            const notification = new Notification('Qanda: Notifications are on for Qanda.');
        }
    });
    }
}

const observer = new ResizeObserver(entries => {
    const entry = entries[0];
    const currentHeight = entry.contentRect.height;
    if (lastHeight > 0) {
        loadMoreThreadsIfNeeded();
    }

    lastHeight = currentHeight;
});

observer.observe(UI.threadsList);

// If user refreshes page while still logged in
if (localStorage.getItem('token')) {
    startPolling();
    showDashboard();
}
