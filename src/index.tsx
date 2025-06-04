// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import React from 'react';
import './index.css';

import store from './app/store'
import { Provider } from 'react-redux'

import { AppFC } from './app/App';
import { AuthProvider } from './hooks/useAuth';

import { PersistGate } from 'redux-persist/integration/react'
import { persistStore } from 'redux-persist'
import { createRoot } from 'react-dom/client';

let persistor = persistStore(store);

const domNode = document.getElementById('root') as HTMLElement;
const root = createRoot(domNode);

root.render(<React.StrictMode>
        <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <AuthProvider>
                    <AppFC />
                </AuthProvider>
            </PersistGate>
        </Provider>
</React.StrictMode>);
