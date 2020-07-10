// Reducer that control session (login, logout)
import {
    LOGIN,
    LOGOUT
} from '../constants/actionTypes';

const initialState = {
    isLogin: false,
    sessionID: ''
};

export default (state = initialState, action) => {
    switch (action.type) {
        case LOGIN: {
            return {
                ...state,
                isLogin: action.payload.isLogin,
                sessionID: action.payload.sessionID
            };
        }
        case LOGOUT: {
            return {
                ...state,
                isLogin: action.payload.isLogin,
                sessionID: action.payload.sessionID
            }
        }
        default:
            return state;
    }
}