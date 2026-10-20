
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out MedVerify source code'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Build and Test') {
            steps {
                bat 'npm run build'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t jashk185/medverify:latest .'
            }
        }

        



stage('Push Image to Docker Hub') {
    steps {
        withCredentials([
            usernamePassword(
                credentialsId: 'dockerhub-pat-new',
                usernameVariable: 'DOCKER_USER',
                passwordVariable: 'DOCKER_PASS'
            )
        ]) {
            powershell '''
                $ErrorActionPreference = "Stop"
                $dockerConfig = Join-Path $env:TEMP ("jenkins-docker-" + [guid]::NewGuid())
                New-Item -ItemType Directory -Path $dockerConfig | Out-Null
                $env:DOCKER_CONFIG = $dockerConfig

                try {
                    Write-Host "Docker username: $env:DOCKER_USER"
                    Write-Host "Token length: $($env:DOCKER_PASS.Length)"

                    $env:DOCKER_PASS.TrimEnd("`r", "`n") |
                        docker login --username $env:DOCKER_USER --password-stdin

                    if ($LASTEXITCODE -ne 0) {
                        throw "Docker Hub login failed with exit code $LASTEXITCODE"
                    }

                    docker push jashk185/medverify:latest
                    if ($LASTEXITCODE -ne 0) {
                        throw "Docker Hub push failed with exit code $LASTEXITCODE"
                    }
                }
                finally {
                    Remove-Item -Recurse -Force $dockerConfig -ErrorAction SilentlyContinue
                }
            '''
        }
    }
}

    }
}

