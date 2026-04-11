import axios from 'axios';

declare module './api' {
  export const api: typeof axios;
}
