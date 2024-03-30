import { BACKEND_PORT } from './config.js';

/**
 * Given a js file object representing a jpg or png image, such as one taken
 * from a html file input element, return a promise which resolves to the file
 * data as a data url.
 * More info:
 *   https://developer.mozilla.org/en-US/docs/Web/API/File
 *   https://developer.mozilla.org/en-US/docs/Web/API/FileReader
 *   https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
 * 
 * Example Usage:
 *   const file = document.querySelector('input[type="file"]').files[0];
 *   console.log(fileToDataUrl(file));
 * @param {File} file The file to be read.
 * @return {Promise<string>} Promise which resolves to the file as a data url.
 */
export function fileToDataUrl(file) {
    const validFileTypes = [ 'image/jpeg', 'image/png', 'image/jpg' ]
    const valid = validFileTypes.find(type => type === file.type);
    // Bad data, let's walk away.
    if (!valid) {
        throw Error('provided file is not a png, jpg or jpeg image.');
    }
    
    const reader = new FileReader();
    const dataUrlPromise = new Promise((resolve,reject) => {
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result);
    });
    reader.readAsDataURL(file);
    return dataUrlPromise;
}

// function name, expects arguements ready to be put into fetch
export const noAuthAPICall = (path, method, body) => {
    let url = `http://localhost:${BACKEND_PORT}/${path}`;
    return new Promise((resolve, reject) => {
        fetch(url, {
        method: `${method}`,
        headers: {
            'Content-type': 'application/json',
        },
        body: body
        })
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                reject(data.error)
            } else {
                resolve(data);
            }
        });
    });
};

// function name, expects arguements ready to be put into fetch
export const authAPICall = (path, method, token, body = undefined, queryString = undefined) => {
    let url = `http://localhost:${BACKEND_PORT}/${path}`;
    
    // add querystring
    if (queryString !== undefined) {
        url += `?${queryString}`;
    }

    // add token
    let options = {
        method: method,
        headers: {
          'Content-type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
    };

    // add body
    if (body !== undefined) {
        options.body = body;
    }

    return new Promise((resolve, reject) => {  
        fetch(url, options)
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                reject(data.error)
            } else {
                resolve(data);
            }
        });
    });
};